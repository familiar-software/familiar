#!/usr/bin/env node

const fs = require('node:fs')

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const finalDelayMs = Number.parseInt(process.env.FAMILIAR_E2E_AUDIO_FINAL_DELAY_MS || '150', 10)
const startDelayMs = Number.parseInt(process.env.FAMILIAR_E2E_AUDIO_START_DELAY_MS || '0', 10)
const killOnStartMarkerPath = process.env.FAMILIAR_E2E_AUDIO_KILL_ON_START_MARKER_PATH || ''
const unavailableReason = process.env.FAMILIAR_E2E_AUDIO_UNAVAILABLE_REASON || ''
const systemAudioUnavailableReason =
  process.env.FAMILIAR_E2E_SYSTEM_AUDIO_UNAVAILABLE_REASON || ''
const otherVoicesSource = process.env.FAMILIAR_E2E_OTHER_VOICES_SOURCE === 'system-audio'
  ? 'system-audio'
  : 'microphone'
const killOnStartCount = Number.parseInt(
  process.env.FAMILIAR_E2E_AUDIO_KILL_ON_START_COUNT || (killOnStartMarkerPath ? '1' : '0'),
  10
)
let stopped = false
let inputBuffer = ''

const writeMessage = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const stop = () => {
  if (stopped) {
    return
  }
  stopped = true
  process.exit(0)
}

const writeTranscriptEvent = (payload) => {
  writeMessage({
    type: 'event',
    event: 'transcription',
    payload
  })
}

async function streamTranscript () {
  await delay(150)
  writeTranscriptEvent({
    text: 'Hello from',
    isFinal: false,
    startedAtMs: 0,
    endedAtMs: 700,
    segments: [{ text: 'Hello from', startedAtMs: 0, endedAtMs: 700 }]
  })
  await delay(Number.isFinite(finalDelayMs) && finalDelayMs >= 0 ? finalDelayMs : 150)
  writeTranscriptEvent({
    text: 'Hello from the meeting. We should ship live notes.',
    isFinal: true,
    startedAtMs: 0,
    endedAtMs: 2800,
    segments: [{
      text: 'Hello from the meeting. We should ship live notes.',
      startedAtMs: 0,
      endedAtMs: 2800,
      words: [
        { text: 'Hello', startedAtMs: 0, endedAtMs: 250 },
        { text: 'from', startedAtMs: 300, endedAtMs: 500 },
        { text: 'the', startedAtMs: 550, endedAtMs: 700 },
        { text: 'meeting.', startedAtMs: 750, endedAtMs: 1200 },
        { text: 'We', startedAtMs: 1300, endedAtMs: 1450 },
        { text: 'should', startedAtMs: 1500, endedAtMs: 1750 },
        { text: 'ship', startedAtMs: 1800, endedAtMs: 2050 },
        { text: 'live', startedAtMs: 2100, endedAtMs: 2350 },
        { text: 'notes.', startedAtMs: 2400, endedAtMs: 2800 }
      ]
    }]
  })
}

function writeDiarizedTranscript () {
  const usesSystemAudio = otherVoicesSource === 'system-audio'
  writeTranscriptEvent({
    text: 'Hello from the meeting. We should ship live notes.',
    isFinal: true,
    replaceTranscript: true,
    otherVoicesSource,
    startedAtMs: 0,
    endedAtMs: 2800,
    segments: [
      {
        text: 'Hello from the meeting.',
        startedAtMs: 0,
        endedAtMs: 1200,
        speaker: usesSystemAudio ? 'You' : 'Speaker 1'
      },
      {
        text: 'We should ship live notes.',
        startedAtMs: 1300,
        endedAtMs: 2800,
        speaker: usesSystemAudio ? 'Speaker 1' : 'Speaker 2'
      }
    ]
  })
}

function shouldKillOnStart () {
  if (!killOnStartMarkerPath || !Number.isFinite(killOnStartCount) || killOnStartCount <= 0) {
    return false
  }
  const currentCount = fs.existsSync(killOnStartMarkerPath)
    ? Number.parseInt(fs.readFileSync(killOnStartMarkerPath, 'utf-8'), 10)
    : 0
  const normalizedCount = Number.isFinite(currentCount) ? currentCount : 0
  if (normalizedCount >= killOnStartCount) {
    return false
  }
  fs.writeFileSync(killOnStartMarkerPath, String(normalizedCount + 1))
  return true
}

async function handleStartCommand (message) {
  if (shouldKillOnStart()) {
    process.kill(process.pid, 'SIGKILL')
    return
  }
  await delay(Number.isFinite(startDelayMs) && startDelayMs >= 0 ? startDelayMs : 0)
  writeMessage({ type: 'response', id: message.id, ok: true, payload: {} })
  void streamTranscript()
}

const handleCommand = (message) => {
  if (message.command === 'prewarm_model') {
    const reason = unavailableReason || systemAudioUnavailableReason
    if (reason) {
      writeMessage({
        type: 'response',
        id: message.id,
        ok: false,
        error: reason
      })
      return
    }
    writeMessage({
      type: 'response',
      id: message.id,
      ok: true,
      payload: {
        available: true,
        durationMs: 1,
        locale: 'en-US'
      }
    })
    return
  }
  if (message.command === 'start_capture') {
    void handleStartCommand(message)
    return
  }
  if (message.command === 'stop_capture') {
    process.stderr.write(
      '[familiar-speech-helper] diarization_progress completed=1 total=1\n'
    )
    writeDiarizedTranscript()
    writeMessage({ type: 'response', id: message.id, ok: true, payload: {} })
    stop()
    return
  }
  writeMessage({
    type: 'response',
    id: message.id,
    ok: false,
    error: `Unsupported fake helper command: ${message.command}`
  })
}

process.stdin.on('data', (chunk) => {
  inputBuffer += chunk.toString('utf-8')
  const lines = inputBuffer.split(/\r?\n/)
  inputBuffer = lines.pop() || ''
  for (const line of lines) {
    if (!line.trim()) {
      continue
    }
    handleCommand(JSON.parse(line))
  }
})

process.on('SIGTERM', stop)
process.on('SIGINT', stop)
