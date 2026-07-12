const { spawn } = require('node:child_process')

const COMMAND_TIMEOUT_MS = 30000
const PREWARM_COMMAND_TIMEOUT_MS = 600000
const START_COMMAND_TIMEOUT_MS = 120000
const STOP_COMMAND_TIMEOUT_MS = 120000
const STOP_TIMEOUT_MS = 125000
const TERMINATE_GRACE_MS = 3000
const TERMINATE_FORCE_GRACE_MS = 3000

function noop () {}

function writeJsonLine (stream, value) {
  stream.write(`${JSON.stringify(value)}\n`)
}

function pickString (...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return ''
}

function pickNumber (...values) {
  for (const value of values) {
    if (Number.isFinite(value)) {
      return value
    }
  }
  return undefined
}

function resolveStartCaptureOptions (env = process.env) {
  const inputDeviceName = pickString(env.FAMILIAR_AUDIO_INPUT_DEVICE_NAME)
  return inputDeviceName ? { inputDeviceName } : {}
}

function endChildStdin (child, logger = console) {
  if (!child?.stdin || child.stdin.destroyed || child.stdin.writableEnded) {
    return
  }
  try {
    child.stdin.end()
  } catch (error) {
    logger.warn('Failed to close speech helper stdin', {
      message: error?.message || String(error)
    })
  }
}

function killChild (child, signal, logger = console) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return false
  }
  try {
    return child.kill(signal)
  } catch (error) {
    logger.warn('Failed to signal speech helper process', {
      pid: child.pid || null,
      signal,
      message: error?.message || String(error)
    })
    return false
  }
}

function unrefTimer (timer) {
  if (timer && typeof timer.unref === 'function') {
    timer.unref()
  }
}

function createHelperExitError ({ code, signal, child, helperPath }) {
  const error = new Error(`Speech helper exited with code ${code} and signal ${signal || ''}.`)
  error.exitCode = code
  error.signal = signal || ''
  error.pid = child?.pid || null
  error.helperPath = helperPath || ''
  return error
}

function normalizeTranscriptWords (words = []) {
  if (!Array.isArray(words)) {
    return []
  }
  return words.map((word) => ({
    text: pickString(word?.text, word?.word),
    startedAtMs: pickNumber(word?.startedAtMs, word?.startMs, word?.startTimeMs),
    endedAtMs: pickNumber(word?.endedAtMs, word?.endMs, word?.endTimeMs)
  })).filter((word) => word.text)
}

function normalizeTranscriptSegments (segments = []) {
  if (!Array.isArray(segments)) {
    return []
  }
  return segments.map((segment) => {
    const words = normalizeTranscriptWords(segment?.words)
    const normalizedSegment = {
      text: pickString(segment?.text, segment?.transcription),
      startedAtMs: pickNumber(segment?.startedAtMs, segment?.startMs, segment?.startTimeMs),
      endedAtMs: pickNumber(segment?.endedAtMs, segment?.endMs, segment?.endTimeMs),
      speaker: pickString(segment?.speaker, segment?.speakerId)
    }
    if (words.length > 0) {
      normalizedSegment.words = words
    }
    return normalizedSegment
  }).filter((segment) => segment.text)
}

function normalizeTranscriptPayload (payload = {}, defaultType = 'partial') {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const segments = normalizeTranscriptSegments(
    payload.segments || payload.speakerTurns || payload.turns
  )
  const text = pickString(payload.text, payload.partialText, payload.transcription)
  if (!text && segments.length === 0) {
    return null
  }

  const isFinal = payload.isFinal === true ||
    payload.final === true ||
    payload.state === 'final' ||
    defaultType === 'final'
  const event = {
    type: isFinal ? 'final' : 'partial',
    text,
    startedAtMs: pickNumber(payload.startedAtMs, payload.startMs, payload.startTimeMs),
    endedAtMs: pickNumber(payload.endedAtMs, payload.endMs, payload.endTimeMs),
    segments
  }
  if (payload.replaceTranscript === true) {
    event.replaceTranscript = true
  }
  if (['microphone', 'system-audio'].includes(payload.otherVoicesSource)) {
    event.otherVoicesSource = payload.otherVoicesSource
  }
  return event
}

function createSpeechHelperClient ({
  helperPath,
  spawnImpl = spawn,
  env = process.env,
  logger = console,
  onClose = noop,
  onFinalizationProgress = noop,
  onStderr = noop,
  onTranscriptEvent = noop,
  scheduler = { setTimeout, clearTimeout },
  commandTimeoutMs = COMMAND_TIMEOUT_MS,
  prewarmCommandTimeoutMs = PREWARM_COMMAND_TIMEOUT_MS,
  startCommandTimeoutMs = START_COMMAND_TIMEOUT_MS,
  stopCommandTimeoutMs = STOP_COMMAND_TIMEOUT_MS,
  stopTimeoutMs = STOP_TIMEOUT_MS,
  terminateGraceMs = TERMINATE_GRACE_MS,
  terminateForceGraceMs = TERMINATE_FORCE_GRACE_MS,
  processLifecycle = process
} = {}) {
  const child = spawnImpl(helperPath, [], {
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const pending = new Map()
  let nextRequestId = 0
  let stdoutBuffer = ''
  let stderrBuffer = ''
  let closed = false
  let closeDetails = null
  let stopForceTimer = null
  let lastFinalizationProgress = ''

  const processExitHandler = () => {
    endChildStdin(child, logger)
    killChild(child, 'SIGTERM', logger)
  }

  if (Number.isInteger(child.pid) && typeof processLifecycle?.once === 'function') {
    processLifecycle.once('exit', processExitHandler)
  }

  function removeProcessExitHandler () {
    if (typeof processLifecycle?.off === 'function') {
      processLifecycle.off('exit', processExitHandler)
      return
    }
    if (typeof processLifecycle?.removeListener === 'function') {
      processLifecycle.removeListener('exit', processExitHandler)
    }
  }

  function waitForClose (timeoutMs) {
    if (closed) {
      return Promise.resolve({ closed: true, ...closeDetails })
    }
    return new Promise((resolve) => {
      const onClose = (code, signal) => {
        scheduler.clearTimeout(timer)
        resolve({ closed: true, code, signal })
      }
      const timer = scheduler.setTimeout(() => {
        child.off('close', onClose)
        resolve({ closed: false, code: null, signal: null })
      }, timeoutMs)
      unrefTimer(timer)
      child.once('close', onClose)
    })
  }

  function rejectPending (error) {
    const waiters = Array.from(pending.values())
    pending.clear()
    waiters.forEach(({ reject, timer }) => {
      scheduler.clearTimeout(timer)
      reject(error)
    })
  }

  function scheduleRequestTimeout (id, request) {
    request.timer = scheduler.setTimeout(() => {
      pending.delete(id)
      request.reject(new Error(`Speech helper command timed out: ${request.command}`))
    }, request.timeoutMs)
  }

  function refreshStopRequestTimeout () {
    for (const [id, request] of pending.entries()) {
      if (request.command !== 'stop_capture') {
        continue
      }
      scheduler.clearTimeout(request.timer)
      scheduleRequestTimeout(id, request)
    }
  }

  function scheduleStopForceTimer () {
    if (stopForceTimer) {
      scheduler.clearTimeout(stopForceTimer)
    }
    stopForceTimer = scheduler.setTimeout(() => {
      stopForceTimer = null
      if (!closed) {
        killChild(child, 'SIGKILL', logger)
      }
    }, stopTimeoutMs)
    unrefTimer(stopForceTimer)
  }

  function handleFinalizationProgressLine (line) {
    const match = line.match(/diarization_progress completed=(\d+) total=(\d+)/)
    if (!match || !stopForceTimer) {
      return
    }
    const completedChunks = Number.parseInt(match[1], 10)
    const totalChunks = Number.parseInt(match[2], 10)
    const progressKey = `${completedChunks}/${totalChunks}`
    const isInvalid = totalChunks <= 0 || completedChunks > totalChunks
    if (isInvalid || progressKey === lastFinalizationProgress) {
      return
    }
    lastFinalizationProgress = progressKey
    refreshStopRequestTimeout()
    scheduleStopForceTimer()
    onFinalizationProgress({ completedChunks, totalChunks })
  }

  function emitPayload (payload, defaultType) {
    const event = normalizeTranscriptPayload(payload, defaultType)
    if (event) {
      onTranscriptEvent(event)
    }
  }

  function handleResponse (message) {
    const request = pending.get(message.id)
    if (!request) {
      return
    }
    pending.delete(message.id)
    scheduler.clearTimeout(request.timer)
    if (message.ok === false) {
      request.reject(new Error(message.error || 'Speech helper request failed.'))
      return
    }
    request.resolve(message.payload || {})
  }

  function handleEvent (message) {
    if (message.event !== 'transcription' && message.event !== 'final') {
      return
    }
    emitPayload(message.payload || {}, message.event === 'final' ? 'final' : 'partial')
  }

  function handleStdoutLine (line) {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }
    try {
      const message = JSON.parse(trimmed)
      if (message.type === 'response' && message.id) {
        handleResponse(message)
        return
      }
      if (message.type === 'event') {
        handleEvent(message)
      }
    } catch (error) {
      logger.warn('Ignoring invalid speech helper output', {
        line: trimmed.slice(0, 200),
        message: error?.message || String(error)
      })
    }
  }

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf-8')
    const lines = stdoutBuffer.split(/\r?\n/)
    stdoutBuffer = lines.pop() || ''
    lines.forEach(handleStdoutLine)
  })

  child.stderr.on('data', (chunk) => {
    onStderr(chunk)
    stderrBuffer += chunk.toString('utf-8')
    const lines = stderrBuffer.split(/\r?\n/)
    stderrBuffer = lines.pop() || ''
    lines.forEach(handleFinalizationProgressLine)
  })

  child.once('error', (error) => {
    rejectPending(error)
  })

  child.once('close', (code, signal) => {
    closed = true
    closeDetails = { code, signal }
    removeProcessExitHandler()
    rejectPending(createHelperExitError({ code, signal, child, helperPath }))
    onClose({ code, signal, pid: child.pid || null, helperPath })
  })

  function sendCommand (command, payload = {}, options = {}) {
    if (closed) {
      return Promise.reject(new Error('Speech helper is not running.'))
    }

    const id = String(++nextRequestId)
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? options.timeoutMs
      : commandTimeoutMs
    return new Promise((resolve, reject) => {
      const request = { command, reject, resolve, timeoutMs, timer: null }
      pending.set(id, request)
      scheduleRequestTimeout(id, request)
      writeJsonLine(child.stdin, { id, command, ...payload })
    })
  }

  async function stopCapture () {
    if (closed) {
      return
    }

    lastFinalizationProgress = ''
    scheduleStopForceTimer()
    try {
      const payload = await sendCommand('stop_capture', {}, { timeoutMs: stopCommandTimeoutMs })
      emitPayload(payload, 'final')
    } finally {
      if (stopForceTimer) {
        scheduler.clearTimeout(stopForceTimer)
        stopForceTimer = null
      }
      endChildStdin(child, logger)
    }
  }

  async function terminate ({
    signal = 'SIGTERM',
    forceSignal = 'SIGKILL',
    graceMs = terminateGraceMs,
    forceGraceMs = terminateForceGraceMs
  } = {}) {
    if (closed) {
      return { closed: true, ...closeDetails, forced: false }
    }

    endChildStdin(child, logger)
    killChild(child, signal, logger)
    const gracefulClose = await waitForClose(graceMs)
    if (gracefulClose.closed) {
      return { ...gracefulClose, forced: false }
    }

    killChild(child, forceSignal, logger)
    const forcedClose = await waitForClose(forceGraceMs)
    return { ...forcedClose, forced: true }
  }

  return {
    child,
    kill: (signal) => killChild(child, signal, logger),
    sendCommand,
    prewarmModel: () =>
      sendCommand('prewarm_model', {}, { timeoutMs: prewarmCommandTimeoutMs }),
    startCapture: (options = {}) =>
      sendCommand('start_capture', options, { timeoutMs: startCommandTimeoutMs }),
    stopCapture,
    terminate
  }
}

module.exports = {
  createSpeechHelperClient,
  normalizeTranscriptPayload,
  resolveStartCaptureOptions
}
