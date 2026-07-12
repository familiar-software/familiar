const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  buildAudioPlayer,
  collectJsonLines,
  generateSpeechFixture,
  getInstalledVoiceNames,
  getMacLogSnapshot,
  getProcessSnapshot,
  killChild,
  runDiarizationCapture,
  waitForMessageOrClose,
  writeJsonLine
} = require('./helpers/real-audio-process')

const appRoot = path.join(__dirname, '..')
const helperPath = path.join(appRoot, 'scripts', 'bin', 'familiar-speech-helper')
const blackHoleDeviceName = 'BlackHole 2ch'
const fixtureDirectories = []

const shouldRunBlackHole = process.env.FAMILIAR_REAL_AUDIO_TEST === '1' &&
  process.platform === 'darwin'
const shouldRunStartup = process.platform === 'darwin' &&
  (process.env.FAMILIAR_REAL_AUDIO_STARTUP_TEST === '1' ||
    process.env.FAMILIAR_REAL_AUDIO_TEST === '1')
const startupTimeoutMs = Number.parseInt(
  process.env.FAMILIAR_REAL_AUDIO_STARTUP_TIMEOUT_MS || '45000',
  10
)
const startupSmokeTimeoutMs = Number.parseInt(
  process.env.FAMILIAR_REAL_AUDIO_SMOKE_TIMEOUT_MS || '120000',
  10
)

function createStartCommand ({ id, inputDeviceName = '' }) {
  const command = { id, command: 'start_capture' }
  if (inputDeviceName) {
    command.inputDeviceName = inputDeviceName
  }
  return command
}

function makeFixtureDirectory () {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-real-audio-'))
  fixtureDirectories.push(directory)
  return directory
}

test.after(() => {
  for (const directory of fixtureDirectories) {
    fs.rmSync(directory, { force: true, recursive: true })
  }
})

test('real speech helper prepares the Apple speech capability before capture', {
  skip: shouldRunStartup
    ? false
    : 'Set FAMILIAR_REAL_AUDIO_STARTUP_TEST=1 on macOS to run the real helper smoke.'
}, async () => {
  const child = spawn(helperPath, [], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const messages = collectJsonLines(child.stdout)
  let stderr = ''
  let primaryError = null
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf-8')
  })

  try {
    writeJsonLine(child.stdin, {
      id: 'startup-smoke',
      command: 'prewarm_model'
    })
    const response = await waitForMessageOrClose({
      child,
      messages,
      predicate: (message) => message.type === 'response' && message.id === 'startup-smoke',
      timeoutMs: Number.isFinite(startupSmokeTimeoutMs) ? startupSmokeTimeoutMs : 120000,
      label: 'speech helper capability response',
      getStderr: () => stderr,
      getProcessSnapshot: () => getProcessSnapshot(child.pid),
      getSystemLogSnapshot: getMacLogSnapshot
    })
    if (response.ok === false) {
      assert.match(response.error, /Screen Recording access is required/)
      return
    }
    assert.equal(response.ok, true, response.error || stderr)
    assert.equal(response.payload.available, true)
    assert.equal(response.payload.assetState, 'installed')
    assert.match(response.payload.locale, /^en[-_]/i)
    assert.ok(response.payload.inputDevices.length > 0)
    assert.equal(
      Object.prototype.hasOwnProperty.call(response.payload, 'captureProfiles'),
      false
    )
    assert.match(stderr, /helper started pid=/)
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const cleanup = await killChild(child)
    if (primaryError) {
      primaryError.message = `${primaryError.message}\n` +
        `Cleanup result: ${JSON.stringify(cleanup)}\n` +
        `Post-cleanup process snapshot:\n${getProcessSnapshot(child.pid)}`
    } else {
      assert.equal(cleanup.closed, true, 'speech helper should exit during test cleanup')
    }
  }
})

test('real speech helper returns a start_capture response without hanging or exiting', {
  skip: shouldRunStartup
    ? false
    : 'Set FAMILIAR_REAL_AUDIO_STARTUP_TEST=1 on macOS to run the real helper startup smoke.'
}, async () => {
  const inputDeviceName = process.env.FAMILIAR_REAL_AUDIO_INPUT_DEVICE_NAME ||
    process.env.FAMILIAR_AUDIO_INPUT_DEVICE_NAME ||
    ''
  const child = spawn(helperPath, [], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const messages = collectJsonLines(child.stdout)
  let stderr = ''
  let primaryError = null
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf-8')
  })

  try {
    writeJsonLine(child.stdin, createStartCommand({
      id: 'start',
      inputDeviceName
    }))
    const startResponse = await waitForMessageOrClose({
      child,
      messages,
      predicate: (message) => message.type === 'response' && message.id === 'start',
      timeoutMs: Number.isFinite(startupTimeoutMs) ? startupTimeoutMs : 45000,
      label: 'speech helper start response',
      getStderr: () => stderr,
      getProcessSnapshot: () => getProcessSnapshot(child.pid),
      getSystemLogSnapshot: getMacLogSnapshot
    })
    if (startResponse.ok === false) {
      assert.match(
        startResponse.error,
        /Microphone access was not granted|Screen Recording access is required/
      )
      return
    }
    assert.equal(startResponse.ok, true, startResponse.error || stderr)

    writeJsonLine(child.stdin, { id: 'stop', command: 'stop_capture' })
    const stopResponse = await waitForMessageOrClose({
      child,
      messages,
      predicate: (message) => message.type === 'response' && message.id === 'stop',
      timeoutMs: 120000,
      label: 'speech helper stop response',
      getStderr: () => stderr,
      getProcessSnapshot: () => getProcessSnapshot(child.pid),
      getSystemLogSnapshot: getMacLogSnapshot
    })
    assert.equal(stopResponse.ok, true, stopResponse.error || stderr)
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const cleanup = await killChild(child)
    if (primaryError) {
      primaryError.message = `${primaryError.message}\n` +
        `Cleanup result: ${JSON.stringify(cleanup)}\n` +
        `Post-cleanup process snapshot:\n${getProcessSnapshot(child.pid)}`
    } else {
      assert.equal(cleanup.closed, true, 'speech helper should exit during test cleanup')
    }
  }
})

test('real transcriber diarizes two generated voices through BlackHole', {
  skip: shouldRunBlackHole
    ? false
    : 'Set FAMILIAR_REAL_AUDIO_TEST=1 on macOS with BlackHole installed.'
}, async () => {
  const directory = makeFixtureDirectory()
  const playerPath = await buildAudioPlayer(directory)
  const installedVoices = await getInstalledVoiceNames()
  assert.ok(installedVoices.has('Samantha'), 'The Samantha macOS voice must be installed.')
  assert.ok(installedVoices.has('Rishi'), 'The Rishi macOS voice must be installed.')
  const firstAudioPath = await generateSpeechFixture({
    directory,
    filename: 'speaker-one.wav',
    voice: 'Samantha',
    text: 'Hello familiar. My name is Samantha. I am speaking first in this conversation. ' +
      'I am sitting near the computer and explaining the project in a calm steady voice. ' +
      'The recording should keep my words together before the next person begins.'
  })
  const secondAudioPath = await generateSpeechFixture({
    directory,
    filename: 'speaker-two.wav',
    voice: 'Rishi',
    text: 'Good morning familiar. My name is Rishi. I am speaking second in this ' +
      'conversation. I am responding from the other side of the computer with a different ' +
      'voice. These extra sentences give the local model a meaningful second speaking turn.'
  })
  const { payload, stderr } = await runDiarizationCapture({
    helperPath,
    playerPath,
    audioPaths: [firstAudioPath, secondAudioPath],
    inputDeviceName: blackHoleDeviceName
  })
  assert.match(payload.text, /hello/i)
  assert.match(payload.text, /familiar/i)
  assert.ok(payload.endedAtMs >= payload.startedAtMs)
  const speakers = new Set(payload.segments.map((segment) => segment.speaker).filter(Boolean))
  assert.ok(
    speakers.size >= 2,
    `Expected two speakers, received ${[...speakers].join(', ')}. ` +
      `Segments: ${JSON.stringify(payload.segments)}\nHelper stderr:\n${stderr}`
  )
  const words = payload.segments.flatMap((segment) => segment.words || [])
  assert.ok(words.length > 0)
  assert.ok(words.every((word) => word.endedAtMs >= word.startedAtMs))
  assert.ok(words.every((word, index) => index === 0 ||
    word.startedAtMs >= words[index - 1].startedAtMs))
  assert.match(stderr, /diarization_progress completed=\d+ total=\d+/)
})

test('real transcriber keeps one generated voice as one speaker through BlackHole', {
  skip: shouldRunBlackHole
    ? false
    : 'Set FAMILIAR_REAL_AUDIO_TEST=1 on macOS with BlackHole installed.'
}, async () => {
  const directory = makeFixtureDirectory()
  const playerPath = await buildAudioPlayer(directory)
  const installedVoices = await getInstalledVoiceNames()
  assert.ok(installedVoices.has('Samantha'), 'The Samantha macOS voice must be installed.')
  const audioPath = await generateSpeechFixture({
    directory,
    filename: 'single-speaker.wav',
    voice: 'Samantha',
    text: 'Hello familiar. My name is Samantha. I am recording a personal note near my ' +
      'computer. There is only one person speaking in this recording. I will continue for ' +
      'a few moments so the system can recognize one consistent voice. This concludes the test.'
  })
  const { payload, stderr } = await runDiarizationCapture({
    helperPath,
    playerPath,
    audioPaths: [audioPath],
    inputDeviceName: blackHoleDeviceName
  })
  const speakers = new Set(payload.segments.map((segment) => segment.speaker).filter(Boolean))
  assert.deepEqual(
    [...speakers],
    ['Speaker 1'],
    `Expected one speaker. Segments: ${JSON.stringify(payload.segments)}\n` +
      `Helper stderr:\n${stderr}`
  )
  assert.match(payload.text, /familiar/i)
  assert.ok(payload.segments.flatMap((segment) => segment.words || []).length > 0)
  assert.match(stderr, /diarization_progress completed=\d+ total=\d+/)
})
