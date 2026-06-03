const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')

const {
  createSpeechHelperClient,
  normalizeTranscriptPayload,
  resolveStartCaptureOptions
} = require('../src/meeting-recording/speech-helper-client')

function createFakeSpeechHelperChild ({ pid = undefined } = {}) {
  const child = new EventEmitter()
  child.pid = pid
  child.exitCode = null
  child.signalCode = null
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killCalls = []
  child.kill = (signal) => {
    child.killCalls.push(signal)
    return true
  }
  return child
}

test('speech helper client normalizes timestamp segment transcript payloads', () => {
  const event = normalizeTranscriptPayload({
    text: 'first second',
    isFinal: true,
    startedAtMs: 0,
    endedAtMs: 1600,
    segments: [
      {
        text: 'first',
        startedAtMs: 0,
        endedAtMs: 800,
        words: [{ text: 'first', startedAtMs: 0, endedAtMs: 800 }]
      },
      { text: 'second', startedAtMs: 800, endedAtMs: 1600 }
    ]
  })

  assert.deepEqual(event, {
    type: 'final',
    text: 'first second',
    startedAtMs: 0,
    endedAtMs: 1600,
    segments: [
      {
        text: 'first',
        startedAtMs: 0,
        endedAtMs: 800,
        speaker: '',
        words: [{ text: 'first', startedAtMs: 0, endedAtMs: 800 }]
      },
      { text: 'second', startedAtMs: 800, endedAtMs: 1600, speaker: '' }
    ]
  })
})

test('speech helper client passes through named input device selection', () => {
  assert.deepEqual(
    resolveStartCaptureOptions({ FAMILIAR_AUDIO_INPUT_DEVICE_NAME: 'BlackHole 2ch' }),
    { inputDeviceName: 'BlackHole 2ch' }
  )
})

test('speech helper client gives stop transcription enough time before force kill', async () => {
  const child = createFakeSpeechHelperChild()
  const scheduledDelays = []
  const transcriptEvents = []
  const scheduler = {
    setTimeout: (_callback, delay) => {
      const timer = { delay }
      scheduledDelays.push(delay)
      return timer
    },
    clearTimeout: (timer) => {
      timer.cleared = true
    }
  }

  child.stdin.on('data', (chunk) => {
    const message = JSON.parse(chunk.toString('utf-8').trim())
    assert.equal(message.command, 'stop_capture')
    setImmediate(() => {
      child.stdout.write(`${JSON.stringify({
        type: 'response',
        id: message.id,
        ok: true,
        payload: {
          text: 'final words',
          isFinal: true,
          startedAtMs: 0,
          endedAtMs: 2000
        }
      })}\n`)
    })
  })

  const client = createSpeechHelperClient({
    helperPath: '/tmp/familiar-speech-helper',
    spawnImpl: () => child,
    scheduler,
    commandTimeoutMs: 10,
    stopCommandTimeoutMs: 120000,
    stopTimeoutMs: 125000,
    onTranscriptEvent: (event) => transcriptEvents.push(event)
  })

  await client.stopCapture()

  assert.deepEqual(scheduledDelays, [125000, 120000])
  assert.deepEqual(child.killCalls, [])
  assert.equal(transcriptEvents.at(-1).text, 'final words')
})

test('speech helper client gives slow startup enough time before command timeout', async () => {
  const child = createFakeSpeechHelperChild()
  const scheduledDelays = []
  const scheduler = {
    setTimeout: (_callback, delay) => {
      const timer = { delay }
      scheduledDelays.push(delay)
      return timer
    },
    clearTimeout: (timer) => {
      timer.cleared = true
    }
  }

  child.stdin.on('data', (chunk) => {
    const message = JSON.parse(chunk.toString('utf-8').trim())
    assert.equal(message.command, 'start_capture')
    setImmediate(() => {
      child.stdout.write(`${JSON.stringify({
        type: 'response',
        id: message.id,
        ok: true,
        payload: {}
      })}\n`)
    })
  })

  const client = createSpeechHelperClient({
    helperPath: '/tmp/familiar-speech-helper',
    spawnImpl: () => child,
    scheduler,
    commandTimeoutMs: 10,
    startCommandTimeoutMs: 120000
  })

  await client.startCapture()

  assert.deepEqual(scheduledDelays, [120000])
})

test('speech helper client signals helper when parent process exits', () => {
  const child = createFakeSpeechHelperChild({ pid: 12345 })
  const lifecycle = new EventEmitter()

  createSpeechHelperClient({
    helperPath: '/tmp/familiar-speech-helper',
    spawnImpl: () => child,
    processLifecycle: lifecycle
  })

  lifecycle.emit('exit')

  assert.deepEqual(child.killCalls, ['SIGTERM'])
  assert.equal(child.stdin.writableEnded, true)
})

test('speech helper client terminate escalates and returns when close never arrives', async () => {
  const child = createFakeSpeechHelperChild({ pid: 12346 })
  const lifecycle = new EventEmitter()
  const timers = []
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

  const client = createSpeechHelperClient({
    helperPath: '/tmp/familiar-speech-helper',
    spawnImpl: () => child,
    scheduler,
    processLifecycle: lifecycle
  })

  const termination = client.terminate({ graceMs: 10, forceGraceMs: 20 })
  await Promise.resolve()

  assert.deepEqual(child.killCalls, ['SIGTERM'])
  assert.equal(timers.at(-1).delay, 10)

  timers.at(-1).callback()
  await Promise.resolve()

  assert.deepEqual(child.killCalls, ['SIGTERM', 'SIGKILL'])
  assert.equal(timers.at(-1).delay, 20)

  timers.at(-1).callback()
  assert.deepEqual(await termination, {
    closed: false,
    code: null,
    signal: null,
    forced: true
  })
})
