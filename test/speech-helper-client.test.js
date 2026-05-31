const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeTranscriptPayload,
  resolveStartCaptureOptions
} = require('../src/meeting-recording/speech-helper-client')

test('speech helper client normalizes plain transcript payloads', () => {
  const event = normalizeTranscriptPayload({
    text: 'plain streamed text',
    isFinal: true,
    startedAtMs: 0,
    endedAtMs: 1600
  })

  assert.deepEqual(event, {
    type: 'final',
    text: 'plain streamed text',
    startedAtMs: 0,
    endedAtMs: 1600
  })
})

test('speech helper client passes through named input device selection', () => {
  assert.deepEqual(
    resolveStartCaptureOptions({ FAMILIAR_AUDIO_INPUT_DEVICE_NAME: 'BlackHole 2ch' }),
    { inputDeviceName: 'BlackHole 2ch' }
  )
})
