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
  PREWARMING: 'prewarming',
  STARTING: 'starting',
  RECORDING: 'recording',
  STOPPING: 'stopping',
  ERROR: 'error'
})

const STOP_TIMEOUT_MS = 130000
const STOP_CLOSE_TIMEOUT_MS = 5000
const START_HELPER_MAX_ATTEMPTS = 3
const STDERR_TAIL_MAX_CHARS = 2000

function noop () {}

function isRetryableStartError (error) {
  const message = error?.message || String(error)
  return error?.signal === 'SIGKILL' || message.includes('signal SIGKILL')
}

function buildStartFailureDiagnostics ({ error, attempt, stderrBuffer }) {
  return {
    phase: 'start_capture',
    attempt,
    maxAttempts: START_HELPER_MAX_ATTEMPTS,
    helperPid: error?.pid || null,
    signal: error?.signal || '',
    helperPath: error?.helperPath || '',
    message: error?.message || String(error),
    stderrTail: stderrBuffer.trim().slice(-STDERR_TAIL_MAX_CHARS)
  }
}

function attachStartFailureDiagnostics (error, diagnostics) {
  if (error && typeof error === 'object') {
    error.meetingRecording = diagnostics
    return error
  }
  const wrapped = new Error(String(error))
  wrapped.meetingRecording = diagnostics
  return wrapped
}

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
  let prewarmHelperClient = null
  let prewarmPromise = null
  let startPromise = null

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
      isPrewarming: state === STATES.PREWARMING,
      isStarting: state === STATES.STARTING,
      isRecording: state === STATES.RECORDING ||
        state === STATES.STOPPING,
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
    waiters.forEach((waiter) => waiter.resolve())
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

  function waitForStop (timeoutMs = STOP_CLOSE_TIMEOUT_MS) {
    if (!childProcess || !speechHelperClient) {
      return Promise.resolve({ closed: true })
    }
    return new Promise((resolve) => {
      let timer = null
      const waiter = {
        resolve: () => {
          scheduler.clearTimeout(timer)
          resolve({ closed: true })
        }
      }
      timer = scheduler.setTimeout(() => {
        stopWaiters = stopWaiters.filter((item) => item !== waiter)
        resolve({ closed: false })
      }, timeoutMs)
      if (timer && typeof timer.unref === 'function') {
        timer.unref()
      }
      stopWaiters.push(waiter)
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

  async function terminateHelper (currentHelper, reason) {
    if (!currentHelper) {
      return { closed: true }
    }
    if (typeof currentHelper.terminate === 'function') {
      const result = await currentHelper.terminate()
      if (result.closed === false) {
        logger.error('Meeting speech helper did not exit after termination', { reason })
      }
      return result
    }

    currentHelper.kill?.('SIGTERM')
    return { closed: false }
  }

  async function startHelperCapture (helperPath) {
    stderrBuffer = ''
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
    childExited = false
    await helper.startCapture(resolveStartCaptureOptions(process.env))
  }

  async function prewarmOnce () {
    const helperPath = resolveSpeechHelperPath()
    let prewarmStderrBuffer = ''
    let helper

    lastErrorMessage = ''
    setState(STATES.PREWARMING, { reason: 'prewarm-started' })
    try {
      helper = createSpeechHelperClientImpl({
        helperPath,
        spawnImpl,
        env: buildHelperEnv(),
        logger,
        onStderr: (chunk) => {
          prewarmStderrBuffer += chunk.toString('utf-8')
          if (prewarmStderrBuffer.length > 8000) {
            prewarmStderrBuffer = prewarmStderrBuffer.slice(-8000)
          }
        },
        scheduler
      })
      prewarmHelperClient = helper
      const payload = await helper.prewarmModel()
      logger.log('Meeting speech helper prewarm finished', {
        durationMs: payload?.durationMs ?? null
      })
      await terminateHelper(helper, 'prewarm-complete')
      if (prewarmHelperClient === helper) {
        prewarmHelperClient = null
      }
      if (state === STATES.PREWARMING) {
        setState(STATES.IDLE, { reason: 'prewarm-complete' })
      }
      return { ok: true, status: getStatus() }
    } catch (error) {
      const message = error?.message || String(error)
      logger.warn('Meeting speech helper prewarm failed', {
        message,
        stderrTail: prewarmStderrBuffer.trim().slice(-STDERR_TAIL_MAX_CHARS)
      })
      if (helper) {
        await terminateHelper(helper, 'prewarm-failed')
      }
      if (prewarmHelperClient === helper) {
        prewarmHelperClient = null
      }
      if (state === STATES.PREWARMING) {
        setState(STATES.IDLE, { reason: 'prewarm-failed' })
      }
      return { ok: false, message, status: getStatus() }
    }
  }

  function handleHelperClose (currentHelper, { code, signal }) {
    if (speechHelperClient !== currentHelper) {
      return
    }
    childExited = true
    if (state === STATES.STARTING) {
      return
    }
    const closeError = !intentionalStop && code !== 0
      ? new Error(stderrBuffer.trim() || `Speech helper exited with code ${code}.`)
      : null
    void (async () => {
      await waitForTranscriptWrites()
      if (speechHelperClient !== currentHelper) {
        return
      }
      finalizeStop({ reason: signal || 'process-close', error: closeError })
    })()
  }

  async function startOnce () {
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
    setState(STATES.STARTING, { sessionId: session.sessionId })

    for (let attempt = 1; attempt <= START_HELPER_MAX_ATTEMPTS; attempt += 1) {
      try {
        await startHelperCapture(helperPath)
        setState(STATES.RECORDING, { sessionId: session.sessionId })
        return { ok: true, status: getStatus() }
      } catch (error) {
        const failedHelper = speechHelperClient
        const diagnostics = buildStartFailureDiagnostics({
          error,
          attempt,
          stderrBuffer
        })
        intentionalStop = true
        speechHelperClient = null
        childProcess = null
        const termination = await terminateHelper(failedHelper, `start-failed-${attempt}`)
        childExited = termination.closed !== false
        const shouldRetry = attempt < START_HELPER_MAX_ATTEMPTS && isRetryableStartError(error)
        if (shouldRetry) {
          logger.warn('Meeting speech helper exited during startup; retrying', diagnostics)
          intentionalStop = false
          continue
        }

        awakeLock?.stop?.({ reason: 'meeting-recording-start-failed' })
        lastErrorMessage = error?.message || String(error)
        logger.error('Meeting speech helper startup failed', diagnostics)
        setState(STATES.ERROR, { reason: 'start-failed' })
        throw attachStartFailureDiagnostics(error, diagnostics)
      }
    }

    throw new Error('Failed to start meeting recording.')
  }

  async function start () {
    if (state === STATES.PREWARMING && prewarmPromise) {
      await prewarmPromise
    }
    if (state === STATES.STARTING && startPromise) {
      await startPromise
      return { ok: true, status: getStatus(), alreadyRecording: true }
    }
    if (state === STATES.RECORDING) {
      return { ok: true, status: getStatus(), alreadyRecording: true }
    }

    startPromise = startOnce()
    try {
      return await startPromise
    } finally {
      startPromise = null
    }
  }

  async function prewarm () {
    if (prewarmPromise) {
      return prewarmPromise
    }
    if (state !== STATES.IDLE) {
      return { ok: true, status: getStatus(), skipped: true }
    }

    prewarmPromise = prewarmOnce()
    try {
      return await prewarmPromise
    } finally {
      prewarmPromise = null
    }
  }

  async function stop ({ reason = 'manual-stop' } = {}) {
    if (state === STATES.STARTING && startPromise) {
      try {
        await startPromise
      } catch {
        return { ok: true, status: getStatus(), alreadyStopped: true }
      }
    }
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
        await terminateHelper(currentHelper, 'stop-capture-failed')
      }
      const stopped = await waitForStop()
      if (!stopped.closed && speechHelperClient === currentHelper) {
        logger.warn('Meeting speech helper did not close after stop; terminating process')
        const termination = await terminateHelper(currentHelper, 'stop-close-timeout')
        const finalized = termination.closed
          ? await waitForStop(1000)
          : { closed: false }
        if (!finalized.closed && speechHelperClient === currentHelper) {
          await waitForTranscriptWrites()
          finalizeStop({
            reason: 'stop-close-timeout',
            error: new Error('Speech helper did not exit after meeting recording stopped.')
          })
        }
      }
    } else {
      await waitForTranscriptWrites()
      finalizeStop({ reason })
    }
    return { ok: true, status: getStatus() }
  }

  async function shutdown (reason = 'quit') {
    if (prewarmPromise) {
      await terminateHelper(prewarmHelperClient, reason)
      await prewarmPromise
      return { ok: true, status: getStatus() }
    }
    return stop({ reason })
  }

  return {
    getStatus,
    prewarm,
    shutdown,
    start,
    stop
  }
}

module.exports = {
  STATES,
  createMeetingRecordingController
}
