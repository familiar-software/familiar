const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { PassThrough } = require('node:stream')

const { createMeetingRecordingController } = require('../src/meeting-recording')

function createFakeChild () {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killCalls = []
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

test('meeting recording starts helper and stops awake lock', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-meeting-unit-'))
  const fakeChild = createFakeChild()
  const awakeLock = createAwakeLockSpy()
  const transcriptEvents = []
  let spawnCall = null

  const controller = createMeetingRecordingController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    resolveWhisperKitModelRootImpl: () => '/tmp/familiar-model-root',
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
  assert.equal(spawnCall.options.env.FAMILIAR_WHISPERKIT_MODEL_ROOT, '/tmp/familiar-model-root')
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

  const controller = createMeetingRecordingController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    resolveWhisperKitModelRootImpl: () => '/tmp/familiar-model-root',
    createSpeechHelperClientImpl: (options) => {
      onClose = options.onClose
      return {
        child: {},
        kill: (signal) => {
          killCalls.push(signal)
        },
        startCapture: async () => {},
        stopCapture: async () => {
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
  assert.equal(scheduledDelays.at(-1), 130000)
  assert.deepEqual(killCalls, [])
})

test('meeting recording reports starting separately from active recording', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-meeting-starting-'))
  const awakeLock = createAwakeLockSpy()
  let resolveStartCapture = null
  let spawnCount = 0

  const controller = createMeetingRecordingController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    resolveWhisperKitModelRootImpl: () => '/tmp/familiar-model-root',
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

test('meeting recording retries when helper is SIGKILLed during startup', async () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-start-sigkill-'))
  const killedChild = createStartKilledChild()
  const healthyChild = createFakeChild()
  const awakeLock = createAwakeLockSpy()
  const spawnedChildren = []

  const controller = createMeetingRecordingController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    resolveWhisperKitModelRootImpl: () => '/tmp/familiar-model-root',
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

  const controller = createMeetingRecordingController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    resolveWhisperKitModelRootImpl: () => '/tmp/familiar-model-root',
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

  const controller = createMeetingRecordingController({
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
    resolveWhisperKitModelRootImpl: () => '/tmp/familiar-model-root',
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

  const controller = createMeetingRecordingController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    resolveWhisperKitModelRootImpl: () => '/tmp/familiar-model-root',
    createSpeechHelperClientImpl: () => ({
      child: {},
      startCapture: async () => {
        throw new Error('startup failed')
      },
      stopCapture: async () => {},
      terminate: async () => {
        terminateReasons.push('start-failed')
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
  assert.deepEqual(terminateReasons, ['start-failed'])
  assert.deepEqual(awakeLock.calls.map((call) => call.type), ['start', 'stop'])
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

  const controller = createMeetingRecordingController({
    awakeLock,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    onError: (error) => errors.push(error),
    getContextFolderPath: () => contextFolderPath,
    getPreferredSessionId: () => 'session-2026-05-30T12-00-00-000',
    validateContextFolderPathImpl: () => ({ ok: true }),
    resolveSpeechHelperPathImpl: () => __filename,
    resolveWhisperKitModelRootImpl: () => '/tmp/familiar-model-root',
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
