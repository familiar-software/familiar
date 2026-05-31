#!/usr/bin/env node

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const finalDelayMs = Number.parseInt(process.env.FAMILIAR_E2E_AUDIO_FINAL_DELAY_MS || '150', 10)
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
    endedAtMs: 700
  })
  await delay(Number.isFinite(finalDelayMs) && finalDelayMs >= 0 ? finalDelayMs : 150)
  writeTranscriptEvent({
    text: 'Hello from the meeting.',
    isFinal: true,
    startedAtMs: 0,
    endedAtMs: 1200
  })
  await delay(150)
  writeTranscriptEvent({
    text: 'We should ship live notes.',
    isFinal: true,
    startedAtMs: 1300,
    endedAtMs: 2800
  })
}

const handleCommand = (message) => {
  if (message.command === 'start_capture') {
    writeMessage({ type: 'response', id: message.id, ok: true, payload: {} })
    void streamTranscript()
    return
  }
  if (message.command === 'stop_capture') {
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
