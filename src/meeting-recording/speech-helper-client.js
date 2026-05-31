const { spawn } = require('node:child_process')

const COMMAND_TIMEOUT_MS = 30000
const STOP_TIMEOUT_MS = 2500

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

function normalizeTranscriptPayload (payload = {}, defaultType = 'partial') {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const text = pickString(payload.text, payload.partialText, payload.transcription)
  if (!text) {
    return null
  }

  const isFinal = payload.isFinal === true ||
    payload.final === true ||
    payload.state === 'final' ||
    defaultType === 'final'
  return {
    type: isFinal ? 'final' : 'partial',
    text,
    startedAtMs: pickNumber(payload.startedAtMs, payload.startMs, payload.startTimeMs),
    endedAtMs: pickNumber(payload.endedAtMs, payload.endMs, payload.endTimeMs)
  }
}

function createSpeechHelperClient ({
  helperPath,
  spawnImpl = spawn,
  env = process.env,
  logger = console,
  onClose = noop,
  onStderr = noop,
  onTranscriptEvent = noop,
  scheduler = { setTimeout, clearTimeout },
  commandTimeoutMs = COMMAND_TIMEOUT_MS,
  stopTimeoutMs = STOP_TIMEOUT_MS
} = {}) {
  const child = spawnImpl(helperPath, [], {
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const pending = new Map()
  let nextRequestId = 0
  let stdoutBuffer = ''
  let closed = false

  function rejectPending (error) {
    const waiters = Array.from(pending.values())
    pending.clear()
    waiters.forEach(({ reject, timer }) => {
      scheduler.clearTimeout(timer)
      reject(error)
    })
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
  })

  child.once('error', (error) => {
    rejectPending(error)
  })

  child.once('close', (code, signal) => {
    closed = true
    rejectPending(new Error(`Speech helper exited with code ${code} and signal ${signal || ''}.`))
    onClose({ code, signal })
  })

  function sendCommand (command, payload = {}) {
    if (closed) {
      return Promise.reject(new Error('Speech helper is not running.'))
    }

    const id = String(++nextRequestId)
    return new Promise((resolve, reject) => {
      const timer = scheduler.setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Speech helper command timed out: ${command}`))
      }, commandTimeoutMs)
      pending.set(id, { resolve, reject, timer })
      writeJsonLine(child.stdin, { id, command, ...payload })
    })
  }

  async function stopCapture () {
    if (closed) {
      return
    }

    const forceTimer = scheduler.setTimeout(() => {
      if (!closed) {
        child.kill('SIGKILL')
      }
    }, stopTimeoutMs)
    try {
      const payload = await sendCommand('stop_capture')
      emitPayload(payload, 'final')
    } finally {
      scheduler.clearTimeout(forceTimer)
      child.stdin.end()
    }
  }

  return {
    child,
    kill: (signal) => child.kill(signal),
    sendCommand,
    startCapture: (options = {}) => sendCommand('start_capture', options),
    stopCapture
  }
}

module.exports = {
  createSpeechHelperClient,
  normalizeTranscriptPayload,
  resolveStartCaptureOptions
}
