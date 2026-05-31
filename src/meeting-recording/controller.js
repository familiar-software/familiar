const { spawn } = require('node:child_process')
const fs = require('node:fs')

const { validateContextFolderPath } = require('../settings')
const {
  createSpeechHelperClient,
  resolveStartCaptureOptions
} = require('./speech-helper-client')
const { createTranscriptWriter } = require('./transcript-writer')
const {
  resolveDefaultSpeechHelperPath,
  resolveMeetingSession,
  resolveWhisperKitModelRoot
} = require('./paths')

const STATES = Object.freeze({
  IDLE: 'idle',
  RECORDING: 'recording',
  STOPPING: 'stopping',
  ERROR: 'error'
})

const STOP_TIMEOUT_MS = 2000

function noop () {}

function createMeetingRecordingController (options = {}) {
  const logger = options.logger || console
  const spawnImpl = options.spawnImpl || spawn
  const awakeLock = options.awakeLock
  const onError = typeof options.onError === 'function' ? options.onError : noop
  const onStateChanged = typeof options.onStateChanged === 'function'
    ? options.onStateChanged
    : noop
  const getContextFolderPath = options.getContextFolderPath || (() => '')
  const getPreferredSessionId = options.getPreferredSessionId || (() => '')
  const validateContextFolderPathImpl = options.validateContextFolderPathImpl ||
    validateContextFolderPath
  const resolveSpeechHelperPathImpl = options.resolveSpeechHelperPathImpl ||
    (() => resolveDefaultSpeechHelperPath({
      env: process.env,
      resourcesPath: process.resourcesPath || ''
    }))
  const resolveWhisperKitModelRootImpl = options.resolveWhisperKitModelRootImpl ||
    (() => resolveWhisperKitModelRoot({
      env: process.env,
      resourcesPath: process.resourcesPath || ''
    }))
  const createTranscriptWriterImpl = options.createTranscriptWriterImpl || createTranscriptWriter
  const createSpeechHelperClientImpl = options.createSpeechHelperClientImpl ||
    createSpeechHelperClient
  const scheduler = options.scheduler || { setTimeout, clearTimeout }

  let state = STATES.IDLE
  let speechHelperClient = null
  let childProcess = null
  let childExited = false
  let stopTimer = null
  let stderrBuffer = ''
  let session = null
  let writer = null
  let queuedTranscriptEvents = []
  let writeIdleWaiters = []
  let isWritingTranscript = false
  let stopWaiters = []
  let intentionalStop = false
  let lastErrorMessage = ''

  function setState (nextState, details = {}) {
    if (state === nextState) {
      return
    }
    const previousState = state
    state = nextState
    logger.log('Meeting recording state change', { from: previousState, to: state, ...details })
    onStateChanged(getStatus())
  }

  function getStatus () {
    return {
      state,
      isRecording: state === STATES.RECORDING || state === STATES.STOPPING,
      awakeLockActive: awakeLock?.isActive?.() === true,
      sessionId: session?.sessionId || '',
      transcriptMarkdownPath: session?.transcriptMarkdownPath || '',
      error: lastErrorMessage
    }
  }

  function resolveContext () {
    const contextFolderPath = getContextFolderPath()
    const validation = validateContextFolderPathImpl(contextFolderPath)
    if (!validation.ok) {
      throw new Error(validation.message || 'Context folder path is invalid.')
    }
    return contextFolderPath
  }

  function resolveSpeechHelperPath () {
    const helperPath = resolveSpeechHelperPathImpl()
    if (!helperPath || !fs.existsSync(helperPath)) {
      throw new Error('Speech helper is not available.')
    }
    return helperPath
  }

  function buildHelperEnv () {
    const modelRoot = resolveWhisperKitModelRootImpl()
    if (!modelRoot) {
      return process.env
    }
    return {
      ...process.env,
      FAMILIAR_WHISPERKIT_MODEL_ROOT: modelRoot
    }
  }

  function notifyError (error) {
    const message = error?.message || String(error)
    lastErrorMessage = message
    logger.error('Meeting recording issue', { error })
    onError({ message, reason: 'meeting-recording' })
  }

  function settleStopWaiters () {
    const waiters = stopWaiters
    stopWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  function settleWriteIdleWaiters () {
    const waiters = writeIdleWaiters
    writeIdleWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  function waitForTranscriptWrites () {
    if (!isWritingTranscript && queuedTranscriptEvents.length === 0) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      writeIdleWaiters.push(resolve)
    })
  }

  async function drainTranscriptEvents () {
    if (isWritingTranscript) {
      return
    }

    isWritingTranscript = true
    while (queuedTranscriptEvents.length > 0) {
      const event = queuedTranscriptEvents.shift()
      try {
        await writer.writeEvent(event)
      } catch (error) {
        notifyError(error)
      }
    }
    isWritingTranscript = false
    settleWriteIdleWaiters()
  }

  function finalizeStop ({ reason, error } = {}) {
    if (stopTimer) {
      scheduler.clearTimeout(stopTimer)
      stopTimer = null
    }
    speechHelperClient = null
    childProcess = null
    childExited = true
    intentionalStop = false
    stderrBuffer = ''
    awakeLock?.stop?.({ reason: reason || 'meeting-recording-stopped' })
    if (error) {
      notifyError(error)
      setState(STATES.ERROR, { reason: reason || 'error' })
    } else {
      setState(STATES.IDLE, { reason: reason || 'stopped' })
    }
    settleStopWaiters()
  }

  function enqueueTranscriptEvent (event) {
    if (!event || !writer) {
      return
    }
    queuedTranscriptEvents.push(event)
    void drainTranscriptEvents()
  }

  function handleStderrData (chunk) {
    stderrBuffer += chunk.toString('utf-8')
    if (stderrBuffer.length > 8000) {
      stderrBuffer = stderrBuffer.slice(-8000)
    }
  }

  function waitForStop () {
    if (!childProcess || childExited) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      stopWaiters.push(resolve)
    })
  }

  function scheduleForcedStop (currentHelper) {
    stopTimer = scheduler.setTimeout(() => {
      stopTimer = null
      if (currentHelper && !childExited) {
        logger.warn('Meeting speech helper did not stop in time; killing process')
        currentHelper.kill('SIGKILL')
      }
    }, STOP_TIMEOUT_MS)
    if (stopTimer && typeof stopTimer.unref === 'function') {
      stopTimer.unref()
    }
  }

  function handleHelperClose (currentHelper, { code, signal }) {
    if (speechHelperClient !== currentHelper) {
      return
    }
    childExited = true
    const closeError = !intentionalStop && code !== 0
      ? new Error(stderrBuffer.trim() || `Speech helper exited with code ${code}.`)
      : null
    void (async () => {
      await waitForTranscriptWrites()
      finalizeStop({ reason: signal || 'process-close', error: closeError })
    })()
  }

  async function start () {
    if (state === STATES.RECORDING) {
      return { ok: true, status: getStatus(), alreadyRecording: true }
    }

    const contextFolderPath = resolveContext()
    const helperPath = resolveSpeechHelperPath()
    lastErrorMessage = ''
    session = resolveMeetingSession({
      contextFolderPath,
      preferredSessionId: getPreferredSessionId()
    })
    writer = createTranscriptWriterImpl(session)
    await writer.ensureInitialized()

    const awakeResult = awakeLock?.start?.({ reason: 'meeting-recording' })
    if (awakeResult && awakeResult.ok === false) {
      throw new Error(awakeResult.message || 'Failed to keep Mac awake for meeting recording.')
    }

    intentionalStop = false
    childExited = false
    try {
      let helper
      helper = createSpeechHelperClientImpl({
        helperPath,
        spawnImpl,
        env: buildHelperEnv(),
        logger,
        onClose: (details) => handleHelperClose(helper, details),
        onStderr: handleStderrData,
        onTranscriptEvent: enqueueTranscriptEvent,
        scheduler
      })
      speechHelperClient = helper
      childProcess = helper.child
      await helper.startCapture(resolveStartCaptureOptions(process.env))
    } catch (error) {
      intentionalStop = true
      speechHelperClient?.kill?.('SIGTERM')
      awakeLock?.stop?.({ reason: 'meeting-recording-start-failed' })
      speechHelperClient = null
      childProcess = null
      childExited = true
      throw error
    }

    setState(STATES.RECORDING, { sessionId: session.sessionId })
    return { ok: true, status: getStatus() }
  }

  async function stop ({ reason = 'manual-stop' } = {}) {
    if (state !== STATES.RECORDING && state !== STATES.STOPPING) {
      return { ok: true, status: getStatus(), alreadyStopped: true }
    }
    if (state !== STATES.STOPPING) {
      setState(STATES.STOPPING, { reason })
    }
    intentionalStop = true
    const currentHelper = speechHelperClient
    if (currentHelper && !childExited) {
      scheduleForcedStop(currentHelper)
      try {
        await currentHelper.stopCapture()
      } catch (error) {
        notifyError(error)
        currentHelper.kill('SIGTERM')
      }
      await waitForStop()
    } else {
      await waitForTranscriptWrites()
      finalizeStop({ reason })
    }
    return { ok: true, status: getStatus() }
  }

  async function shutdown (reason = 'quit') {
    return stop({ reason })
  }

  return {
    getStatus,
    shutdown,
    start,
    stop
  }
}

module.exports = {
  STATES,
  createMeetingRecordingController
}
