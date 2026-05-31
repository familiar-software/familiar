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
          endedAtMs: 500
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
          endedAtMs: 900
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
      endedAtMs: 500
    },
    {
      type: 'final',
      text: 'goodbye',
      startedAtMs: 500,
      endedAtMs: 900
    }
  ])
  assert.deepEqual(awakeLock.calls.map((call) => call.type), ['start', 'stop'])
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
