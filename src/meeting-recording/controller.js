const { spawn } = require('node:child_process')

const {
  createSpeechHelperClient,
  resolveStartCaptureOptions
} = require('./speech-helper-client')
const { createTranscriptWriter } = require('./transcript-writer')
const { resolveMeetingSession } = require('./paths')
const { createMeetingRecordingRequirements } = require('./requirements')
const { createFinalizationWatchdog } = require('./finalization-watchdog')
const {
  START_HELPER_MAX_ATTEMPTS,
  STDERR_TAIL_MAX_CHARS,
  appendHelperDiagnostics,
  attachStartFailureDiagnostics,
  buildStartFailureDiagnostics,
  isRetryableStartError
} = require('./start-failure')
const { createTranscriptEventQueue } = require('./transcript-event-queue')
const { buildMeetingRecordingStatus } = require('./status')

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

function noop () {}

function createMeetingRecordingController (options = {}) {
  const logger = options.logger || console
  const spawnImpl = options.spawnImpl || spawn
  const awakeLock = options.awakeLock
  const onError = typeof options.onError === 'function' ? options.onError : noop
  const onStateChanged = typeof options.onStateChanged === 'function'
    ? options.onStateChanged
    : noop
  const getPreferredSessionId = options.getPreferredSessionId || (() => '')
  const requirements = createMeetingRecordingRequirements(options)
  const createTranscriptWriterImpl = options.createTranscriptWriterImpl || createTranscriptWriter
  const createSpeechHelperClientImpl = options.createSpeechHelperClientImpl ||
    createSpeechHelperClient
  const scheduler = options.scheduler || { setTimeout, clearTimeout }
  const finalizationWatchdog = createFinalizationWatchdog({
    logger,
    scheduler,
    timeoutMs: STOP_TIMEOUT_MS
  })

  let state = STATES.IDLE
  let speechHelperClient = null
  let childProcess = null
  let childExited = false
  let stderrBuffer = ''
  let session = null
  let writer = null
  let stopWaiters = []
  let intentionalStop = false
  let lastErrorMessage = ''
  let prewarmHelperClient = null
  let prewarmPromise = null
  let startPromise = null
  let availability = 'checking'
  let unavailableReason = ''
  let locale = ''
  const transcriptEvents = createTranscriptEventQueue({
    getWriter: () => writer,
    logger,
    onError: notifyError
  })

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
    return buildMeetingRecordingStatus({
      awakeLockActive: awakeLock?.isActive?.() === true,
      availability,
      error: lastErrorMessage,
      locale,
      session,
      state,
      unavailableReason
    })
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

  function finalizeStop ({ reason, error } = {}) {
    finalizationWatchdog.clear()
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

  function handleStderrData (chunk) {
    stderrBuffer = appendHelperDiagnostics(stderrBuffer, chunk, logger)
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

  function handleFinalizationProgress (currentHelper, progress) {
    if (speechHelperClient !== currentHelper || state !== STATES.STOPPING) {
      return
    }
    logger.log('Meeting transcription finalization progress', progress)
    finalizationWatchdog.touch(currentHelper)
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
      env: process.env,
      logger,
      onClose: (details) => handleHelperClose(helper, details),
      onFinalizationProgress: (progress) => {
        handleFinalizationProgress(helper, progress)
      },
      onStderr: handleStderrData,
      onTranscriptEvent: transcriptEvents.enqueue,
      scheduler
    })
    speechHelperClient = helper
    childProcess = helper.child
    childExited = false
    await helper.startCapture(resolveStartCaptureOptions(process.env))
  }

  async function prewarmOnce () {
    let prewarmStderrBuffer = ''
    let helper

    lastErrorMessage = ''
    availability = 'checking'
    unavailableReason = ''
    locale = ''
    setState(STATES.PREWARMING, { reason: 'prewarm-started' })
    try {
      const helperPath = requirements.resolveSpeechHelper()
      helper = createSpeechHelperClientImpl({
        helperPath,
        spawnImpl,
        env: process.env,
        logger,
        onStderr: (chunk) => {
          prewarmStderrBuffer = appendHelperDiagnostics(
            prewarmStderrBuffer,
            chunk,
            logger
          )
        },
        scheduler
      })
      prewarmHelperClient = helper
      const payload = await helper.prewarmModel()
      availability = 'available'
      unavailableReason = ''
      locale = typeof payload?.locale === 'string' ? payload.locale : ''
      logger.log('Meeting speech helper prewarm finished', {
        durationMs: payload?.durationMs ?? null,
        locale: locale || null
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
      availability = 'unavailable'
      unavailableReason = message
      locale = ''
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
      await transcriptEvents.waitForIdle()
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

    const contextFolderPath = requirements.resolveContextFolder()
    const helperPath = requirements.resolveSpeechHelper()
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
        availability = 'available'
        unavailableReason = ''
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
        availability = 'unavailable'
        unavailableReason = lastErrorMessage
        locale = ''
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
    if (availability === 'unavailable') {
      throw new Error(unavailableReason || 'Meeting transcription is unavailable.')
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
    if (state !== STATES.IDLE && state !== STATES.ERROR) {
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
      finalizationWatchdog.touch(currentHelper)
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
          await transcriptEvents.waitForIdle()
          finalizeStop({
            reason: 'stop-close-timeout',
            error: new Error('Speech helper did not exit after meeting recording stopped.')
          })
        }
      }
    } else {
      await transcriptEvents.waitForIdle()
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
