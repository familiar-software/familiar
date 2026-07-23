const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { PassThrough } = require('node:stream')

const { createMeetingRecordingController } = require('../src/meeting-recording')
const { createSpeechHelperClient } = require('../src/meeting-recording/speech-helper-client')

function createFakeChild () {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killCalls = []
  child.startMessages = []
  let closed = false
  let inputBuffer = ''

  const close = (code = 0, signal = null) => {
    if (closed) {
      return
    }
    closed = true
    setImmediate(() => child.emit('close', code, signal))
  }

  const writeMessage = (message) => {
    child.stdout.write(`${JSON.stringify(message)}\n`)
  }

  const handleCommand = (message) => {
    if (message.command === 'start_capture') {
      child.startMessages.push(message)
      writeMessage({ type: 'response', id: message.id, ok: true, payload: {} })
      writeMessage({
        type: 'event',
        event: 'transcription',
        payload: {
          text: 'hello',
          isFinal: false,
          startedAtMs: 0,
          endedAtMs: 500,
          segments: [{ text: 'hello', startedAtMs: 0, endedAtMs: 500 }]
        }
      })
    }
    if (message.command === 'stop_capture') {
      writeMessage({
        type: 'response',
        id: message.id,
        ok: true,
        payload: {
          text: 'goodbye',
          isFinal: true,
          startedAtMs: 500,
          endedAtMs: 900,
          segments: [{ text: 'goodbye', startedAtMs: 500, endedAtMs: 900 }]
        }
      })
      close()
    }
  }

  child.stdin.on('data', (chunk) => {
    inputBuffer += chunk.toString('utf-8')
    const lines = inputBuffer.split(/\r?\n/)
    inputBuffer = lines.pop() || ''
    lines.filter(Boolean).map((line) => JSON.parse(line)).forEach(handleCommand)
  })
  child.kill = (signal) => {
    child.killCalls.push(signal)
    close(0, signal)
    return true
  }
  return child
}

function createStartKilledChild ({ pid = 12345 } = {}) {
  const child = new EventEmitter()
  child.pid = pid
  child.exitCode = null
  child.signalCode = null
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killCalls = []
  let closed = false
  let inputBuffer = ''

  const close = (signal = 'SIGKILL') => {
    if (closed) {
      return
    }
    closed = true
    child.signalCode = signal
    setImmediate(() => child.emit('close', null, signal))
  }

  child.stdin.on('data', (chunk) => {
    inputBuffer += chunk.toString('utf-8')
    const lines = inputBuffer.split(/\r?\n/)
    inputBuffer = lines.pop() || ''
    for (const line of lines.filter(Boolean)) {
      const message = JSON.parse(line)
      if (message.command === 'start_capture') {
        close('SIGKILL')
      }
    }
  })
  child.kill = (signal) => {
    child.killCalls.push(signal)
    close(signal)
    return true
  }
  return child
}

function createAwakeLockSpy () {
  const calls = []
  return {
    calls,
    isActive: () => calls.at(-1)?.type === 'start',
    start: (payload) => {
      calls.push({ type: 'start', payload })
      return { ok: true }
    },
    stop: (payload) => {
      calls.push({ type: 'stop', payload })
      return { ok: true }
    }
  }
}

async function createAvailableController (options) {
  const createCaptureClient = options.createSpeechHelperClientImpl || createSpeechHelperClient
  let needsPrewarmClient = true
  const controller = createMeetingRecordingController({
    ...options,
    createSpeechHelperClientImpl: (clientOptions) => {
      if (!needsPrewarmClient) {
        return createCaptureClient(clientOptions)
      }
      needsPrewarmClient = false
      return {
        child: {},
        prewarmModel: async () => ({ available: true, locale: 'en-US' }),
        terminate: async () => ({ closed: true })
      }
    }
  })
  const readiness = await controller.prewarm()
  assert.equal(readiness.ok, true)
  return controller
}

test('meeting recording prewarms model and returns to idle', async () => {
  const stateChanges = []
  const terminateReasons = []
  let prewarmResolve = null
  let helperOptions = null

  const controller = createMeetingRecordingController({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    onStateChanged: (status) => stateChanges.push(status),
    resolveSpeechHelperPathImpl: () => __filename,
    createSpeechHelperClientImpl: (options) => {
      helperOptions = options
      return {
        child: {},
        prewarmModel: () => new Promise((resolve) => {
          prewarmResolve = resolve
        }),
        terminate: async () => {
          terminateReasons.push('prewarm-complete')
          return { closed: true }
        }
      }
    }
  })

  const prewarmPromise = controller.prewarm()
  await Promise.resolve()

  assert.equal(controller.getStatus().state, 'prewarming')
  assert.equal(controller.getStatus().isPrewarming, true)
  assert.equal(controller.getStatus().isStarting, false)
  assert.equal(controller.getStatus().isRecording, false)
  assert.equal(controller.getStatus().availability, 'checking')
  assert.equal(controller.getStatus().isAvailable, false)
  assert.equal(helperOptions.helperPath, __filename)

  prewarmResolve({
    available: true,
    durationMs: 42,
    locale: 'en-US'
  })
  const result = await prewarmPromise

  assert.equal(result.ok, true)
  assert.equal(controller.getStatus().state, 'idle')
  assert.equal(controller.getStatus().isPrewarming, false)
  assert.equal(controller.getStatus().availability, 'available')
  assert.equal(controller.getStatus().isAvailable, true)
  assert.equal(controller.getStatus().locale, 'en-US')
  assert.deepEqual(terminateReasons, ['prewarm-complete'])
  assert.deepEqual(stateChanges.map((status) => status.state), ['prewarming', 'idle'])
})

test('meeting recording stays unavailable when SpeechTranscriber preparation fails', async () => {
  let startCalls = 0

  const controller = createMeetingRecordingController({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    resolveSpeechHelperPathImpl: () => __filename,
    createSpeechHelperClientImpl: () => ({
      child: {},
      prewarmModel: async () => {
        throw new Error('SpeechTranscriber requires macOS 26 or newer.')
      },
      startCapture: async () => {
        startCalls += 1
      },
      terminate: async () => ({ closed: true })
    })
  })

  const result = await controller.prewarm()

  assert.equal(result.ok, false)
  assert.equal(controller.getStatus().state, 'idle')
  assert.equal(controller.getStatus().availability, 'unavailable')
  assert.equal(controller.getStatus().isAvailable, false)
  assert.match(controller.getStatus().unavailableReason, /macOS 26/)
  await assert.rejects(() => controller.start(), /macOS 26/)
  assert.equal(startCalls, 0)
})

test('meeting recording stays unavailable when the speech helper is missing', async () => {
  const controller = createMeetingRecordingController({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    resolveSpeechHelperPathImpl: () => ''
  })

  const result = await controller.prewarm()

  assert.equal(result.ok, false)
  assert.equal(controller.getStatus().availability, 'unavailable')
  assert.equal(controller.getStatus().isAvailable, false)
  assert.match(controller.getStatus().unavailableReason, /helper is not available/i)
})

test('meeting recording prepares availability before starting on a direct request', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-direct-start-'))
  const calls = []
  let clientCount = 0

  const controller = createMeetingRecordingController({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    createSpeechHelperClientImpl: () => {
      clientCount += 1
      if (clientCount === 1) {
        return {
          child: {},
          prewarmModel: async () => {
            calls.push('prewarm')
            return { available: true, locale: 'en-US' }
          },
          terminate: async () => {
            calls.push('prewarm-terminated')
            return { closed: true }
          }
        }
      }
      return {
        child: {},
        startCapture: async () => calls.push('capture-started')
      }
    },
    createTranscriptWriterImpl: () => ({
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    })
  })

  const result = await controller.start()

  assert.equal(result.ok, true)
  assert.deepEqual(calls, ['prewarm', 'prewarm-terminated', 'capture-started'])
})

test('meeting recording starts helper and stops awake lock', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-meeting-unit-'))
  const fakeChild = createFakeChild()
  const awakeLock = createAwakeLockSpy()
  const transcriptEvents = []
  const logs = []
  let spawnCall = null

  const controller = await createAvailableController({
    awakeLock,
    logger: {
      log: (message, details) => logs.push({ message, details }),
      warn: () => {},
      error: () => {}
    },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    spawnImpl: (command, args, options) => {
      spawnCall = { command, args, options }
      return fakeChild
    },
    createTranscriptWriterImpl: () => ({
      ensureInitialized: async () => {},
      writeEvent: async (event) => {
        transcriptEvents.push(event)
      }
    })
  })

  const startResult = await controller.start()
  assert.equal(startResult.ok, true)
  assert.equal(startResult.status.isRecording, true)
  assert.equal(startResult.status.sessionId, 'session-2026-05-30T12-00-00-000')
  assert.equal(spawnCall.command, __filename)
  assert.deepEqual(spawnCall.args, [])
  assert.equal(spawnCall.options.stdio[0], 'pipe')
  assert.equal(spawnCall.options.env, process.env)
  assert.equal(
    Object.prototype.hasOwnProperty.call(fakeChild.startMessages[0], 'captureProfile'),
    false
  )
  assert.deepEqual(awakeLock.calls.map((call) => call.type), ['start'])

  const stopResult = await controller.stop({ reason: 'test-stop' })

  assert.equal(stopResult.ok, true)
  assert.equal(stopResult.status.isRecording, false)
  assert.deepEqual(fakeChild.killCalls, [])
  assert.deepEqual(transcriptEvents, [
    {
      type: 'partial',
      text: 'hello',
      startedAtMs: 0,
      endedAtMs: 500,
      segments: [{ text: 'hello', startedAtMs: 0, endedAtMs: 500, speaker: '' }]
    },
    {
      type: 'final',
      text: 'goodbye',
      startedAtMs: 500,
      endedAtMs: 900,
      segments: [{ text: 'goodbye', startedAtMs: 500, endedAtMs: 900, speaker: '' }]
    }
  ])
  assert.deepEqual(
    logs
      .filter((entry) => entry.message === 'Meeting transcript event received')
      .map((entry) => entry.details.type),
    ['partial', 'final']
  )
  assert.deepEqual(awakeLock.calls.map((call) => call.type), ['start', 'stop'])
})

test('meeting recording allows slow final transcription before force killing helper', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-meeting-slow-stop-'))
  const awakeLock = createAwakeLockSpy()
  const killCalls = []
  const scheduledDelays = []
  let onClose = null
  const scheduler = {
    setTimeout: (_callback, delay) => {
      const timer = {
        delay,
        unref: () => {}
      }
      scheduledDelays.push(delay)
      return timer
    },
    clearTimeout: (timer) => {
      timer.cleared = true
    }
  }

  const controller = await createAvailableController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    createSpeechHelperClientImpl: (options) => {
      onClose = options.onClose
      return {
        child: {},
        kill: (signal) => {
          killCalls.push(signal)
        },
        startCapture: async () => {},
        stopCapture: async () => {
          options.onFinalizationProgress({ completedChunks: 1, totalChunks: 4 })
          await Promise.resolve()
          onClose({ code: 0, signal: null })
        }
      }
    },
    createTranscriptWriterImpl: () => ({
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    }),
    scheduler
  })

  const startResult = await controller.start()
  const stopResult = await controller.stop({ reason: 'test-stop' })

  assert.equal(startResult.ok, true)
  assert.equal(stopResult.ok, true)
  assert.equal(stopResult.status.isRecording, false)
  assert.deepEqual(scheduledDelays, [130000, 130000])
  assert.deepEqual(killCalls, [])
})

test('meeting recording removes live text and reports finalization failures', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-failed-stop-'))
  const errors = []
  let discardedLiveTranscript = 0

  const controller = await createAvailableController({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    onError: (error) => errors.push(error),
    getContextFolderPath: () => contextFolderPath,
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    createSpeechHelperClientImpl: (options) => ({
      child: {},
      startCapture: async () => {},
      stopCapture: async () => {
        throw new Error('FluidAudio diarization failed.')
      },
      terminate: async () => {
        setImmediate(() => options.onClose({ code: 0, signal: null }))
        return { closed: true }
      }
    }),
    createTranscriptWriterImpl: () => ({
      discardLiveTranscript: async () => {
        discardedLiveTranscript += 1
      },
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    })
  })

  await controller.start()
  const result = await controller.stop({ reason: 'test-stop' })

  assert.equal(result.status.state, 'error')
  assert.equal(discardedLiveTranscript, 1)
  assert.deepEqual(errors, [{
    message: 'FluidAudio diarization failed.',
    reason: 'meeting-recording'
  }])
})

test('meeting recording reports an unexpected clean helper exit', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-helper-exit-'))
  let handleClose = null
  let discardedLiveTranscript = 0

  const controller = await createAvailableController({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    createSpeechHelperClientImpl: (options) => {
      handleClose = options.onClose
      return {
        child: {},
        startCapture: async () => {}
      }
    },
    createTranscriptWriterImpl: () => ({
      discardLiveTranscript: async () => {
        discardedLiveTranscript += 1
      },
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    })
  })

  await controller.start()
  handleClose({ code: 0, signal: null })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(controller.getStatus().state, 'error')
  assert.match(controller.getStatus().error, /exited unexpectedly/)
  assert.equal(discardedLiveTranscript, 1)
})

test('meeting recording reports starting separately from active recording', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-meeting-starting-'))
  const awakeLock = createAwakeLockSpy()
  let resolveStartCapture = null
  let spawnCount = 0

  const controller = await createAvailableController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    createSpeechHelperClientImpl: () => {
      spawnCount += 1
      return {
        child: {},
        kill: () => {},
        startCapture: () => new Promise((resolve) => {
          resolveStartCapture = resolve
        }),
        stopCapture: async () => {}
      }
    },
    createTranscriptWriterImpl: () => ({
      discardLiveTranscript: async () => {},
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    })
  })

  const firstStart = controller.start()
  await Promise.resolve()

  assert.equal(controller.getStatus().state, 'starting')
  assert.equal(controller.getStatus().isRecording, false)
  assert.equal(controller.getStatus().isStarting, true)
  assert.equal(spawnCount, 1)

  const secondStart = controller.start()
  await Promise.resolve()

  assert.equal(spawnCount, 1)
  resolveStartCapture()

  const firstResult = await firstStart
  const secondResult = await secondStart

  assert.equal(firstResult.ok, true)
  assert.equal(secondResult.ok, true)
  assert.equal(controller.getStatus().state, 'recording')
  assert.equal(controller.getStatus().isRecording, true)
  assert.equal(controller.getStatus().isStarting, false)
  assert.equal(spawnCount, 1)
})

test('meeting recording rejects a new start while the previous recording stops', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-meeting-stopping-'))
  let finishStop = null
  let captureClientCount = 0

  const controller = await createAvailableController({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    createSpeechHelperClientImpl: (options) => {
      captureClientCount += 1
      return {
        child: {},
        startCapture: async () => {},
        stopCapture: () => new Promise((resolve) => {
          finishStop = () => {
            resolve()
            setImmediate(() => options.onClose({ code: 0, signal: null }))
          }
        })
      }
    },
    createTranscriptWriterImpl: () => ({
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    })
  })

  await controller.start()
  const stopPromise = controller.stop({ reason: 'test-stop' })
  await Promise.resolve()

  assert.equal(controller.getStatus().state, 'stopping')
  await assert.rejects(() => controller.start(), /still stopping/)
  assert.equal(captureClientCount, 1)

  finishStop()
  const stopResult = await stopPromise
  assert.equal(stopResult.status.state, 'idle')
})

test('meeting recording retries when helper is SIGKILLed during startup', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-start-sigkill-'))
  const killedChild = createStartKilledChild()
  const healthyChild = createFakeChild()
  const awakeLock = createAwakeLockSpy()
  const spawnedChildren = []

  const controller = await createAvailableController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    spawnImpl: () => {
      const child = spawnedChildren.length === 0 ? killedChild : healthyChild
      spawnedChildren.push(child)
      return child
    },
    createTranscriptWriterImpl: () => ({
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    })
  })

  const startResult = await controller.start()

  assert.equal(startResult.ok, true)
  assert.equal(controller.getStatus().state, 'recording')
  assert.equal(spawnedChildren.length, 2)

  const stopResult = await controller.stop({ reason: 'test-stop' })
  assert.equal(stopResult.status.isRecording, false)
})

test('meeting recording survives two SIGKILLed helper startup attempts', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-start-sigkill-'))
  const killedChildren = [
    createStartKilledChild({ pid: 12345 }),
    createStartKilledChild({ pid: 12346 })
  ]
  const healthyChild = createFakeChild()
  const awakeLock = createAwakeLockSpy()
  const spawnedChildren = []

  const controller = await createAvailableController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    spawnImpl: () => {
      const child = killedChildren[spawnedChildren.length] || healthyChild
      spawnedChildren.push(child)
      return child
    },
    createTranscriptWriterImpl: () => ({
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    })
  })

  const startResult = await controller.start()

  assert.equal(startResult.ok, true)
  assert.equal(controller.getStatus().state, 'recording')
  assert.equal(spawnedChildren.length, 3)

  const stopResult = await controller.stop({ reason: 'test-stop' })
  assert.equal(stopResult.status.isRecording, false)
})

test('meeting recording annotates exhausted startup SIGKILL failures', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-start-sigkill-'))
  const killedChildren = [
    createStartKilledChild({ pid: 12345 }),
    createStartKilledChild({ pid: 12346 }),
    createStartKilledChild({ pid: 12347 })
  ]
  const awakeLock = createAwakeLockSpy()
  const warnings = []
  const errors = []
  const spawnedChildren = []

  const controller = await createAvailableController({
    awakeLock,
    logger: {
      log: () => {},
      warn: (message, details) => warnings.push({ message, details }),
      error: (message, details) => errors.push({ message, details })
    },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    spawnImpl: () => {
      const child = killedChildren[spawnedChildren.length]
      spawnedChildren.push(child)
      return child
    },
    createTranscriptWriterImpl: () => ({
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    })
  })

  let thrown = null
  try {
    await controller.start()
  } catch (error) {
    thrown = error
  }

  assert.match(thrown.message, /Speech helper exited with code null and signal SIGKILL/)
  assert.equal(thrown.meetingRecording.phase, 'start_capture')
  assert.equal(thrown.meetingRecording.attempt, 3)
  assert.equal(thrown.meetingRecording.maxAttempts, 3)
  assert.equal(thrown.meetingRecording.helperPid, 12347)
  assert.equal(thrown.meetingRecording.signal, 'SIGKILL')
  assert.equal(spawnedChildren.length, 3)
  assert.equal(warnings.length, 2)
  assert.equal(errors.at(-1).message, 'Meeting speech helper startup failed')
  assert.equal(errors.at(-1).details.attempt, 3)
  assert.deepEqual(awakeLock.calls.map((call) => call.type), ['start', 'stop'])
})

test('meeting recording terminates helper when startup fails', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-start-fail-'))
  const awakeLock = createAwakeLockSpy()
  const terminateReasons = []

  const controller = await createAvailableController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    createSpeechHelperClientImpl: () => ({
      child: {},
      prewarmModel: async () => ({ available: true, locale: 'en-US' }),
      startCapture: async () => {
        throw new Error('startup failed')
      },
      stopCapture: async () => {},
      terminate: async () => {
        terminateReasons.push('terminated')
        return { closed: true }
      }
    }),
    createTranscriptWriterImpl: () => ({
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    })
  })

  await assert.rejects(() => controller.start(), /startup failed/)

  assert.equal(controller.getStatus().state, 'error')
  assert.equal(controller.getStatus().isRecording, false)
  assert.equal(controller.getStatus().availability, 'unavailable')
  assert.match(controller.getStatus().unavailableReason, /startup failed/)
  assert.deepEqual(terminateReasons, ['terminated'])
  assert.deepEqual(awakeLock.calls.map((call) => call.type), ['start', 'stop'])

  const readiness = await controller.prewarm()

  assert.equal(readiness.ok, true)
  assert.equal(readiness.skipped, undefined)
  assert.equal(controller.getStatus().state, 'idle')
  assert.equal(controller.getStatus().availability, 'available')
  assert.deepEqual(terminateReasons, ['terminated', 'terminated'])
})

test('meeting recording finalizes stop when helper process never closes', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-stop-timeout-'))
  const awakeLock = createAwakeLockSpy()
  const timers = []
  const terminateCalls = []
  const errors = []
  const scheduler = {
    setTimeout: (callback, delay) => {
      const timer = { callback, delay, unref: () => {} }
      timers.push(timer)
      return timer
    },
    clearTimeout: (timer) => {
      timer.cleared = true
    }
  }

  const controller = await createAvailableController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    onError: (error) => errors.push(error),
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    createSpeechHelperClientImpl: () => ({
      child: {},
      kill: () => {},
      startCapture: async () => {},
      stopCapture: async () => {},
      terminate: async () => {
        terminateCalls.push('terminate')
        return { closed: false }
      }
    }),
    createTranscriptWriterImpl: () => ({
      discardLiveTranscript: async () => {},
      ensureInitialized: async () => {},
      writeEvent: async () => {}
    }),
    scheduler
  })

  await controller.start()
  const stopPromise = controller.stop({ reason: 'test-stop' })
  await Promise.resolve()
  await Promise.resolve()

  const closeTimer = timers.find((timer) => timer.delay === 5000)
  assert.ok(closeTimer, 'expected stop close timeout to be scheduled')
  closeTimer.callback()

  const stopResult = await stopPromise

  assert.equal(stopResult.ok, true)
  assert.equal(stopResult.status.state, 'error')
  assert.equal(stopResult.status.isRecording, false)
  assert.deepEqual(terminateCalls, ['terminate'])
  assert.match(errors.at(-1).message, /Speech helper did not exit/)
})

test('meeting recording rejects missing speech helper before taking awake lock', async () => {
  const awakeLock = createAwakeLockSpy()
  const controller = createMeetingRecordingController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => '/tmp/familiar-context',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => '/tmp/does-not-exist'
  })

  await assert.rejects(
    () => controller.start(),
    /Speech helper is not available/
  )
  assert.deepEqual(awakeLock.calls, [])
})
