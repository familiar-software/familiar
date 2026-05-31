const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const appRoot = path.join(__dirname, '..')
const helperPath = path.join(appRoot, 'scripts', 'bin', 'familiar-speech-helper')
const playerSourcePath = path.join(appRoot, 'scripts', 'play-audio-to-output-device.m')
const blackHoleDeviceName = 'BlackHole 2ch'

const shouldRun = process.env.FAMILIAR_REAL_AUDIO_TEST === '1' && process.platform === 'darwin'

function waitForClose (child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  }
  return new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
}

function runCommand (command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8')
    })
    child.once('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`${command} exited ${code}: ${stderr || stdout}`))
    })
  })
}

function collectJsonLines (stream) {
  const messages = []
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk.toString('utf-8')
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.trim()) {
        messages.push(JSON.parse(line))
      }
    }
  })
  return messages
}

function writeJsonLine (stream, value) {
  stream.write(`${JSON.stringify(value)}\n`)
}

function waitForMessage (messages, predicate, timeoutMs = 30000) {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const poll = () => {
      const message = messages.find(predicate)
      if (message) {
        resolve(message)
        return
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('Timed out waiting for audio transcription message.'))
        return
      }
      setTimeout(poll, 100)
    }
    poll()
  })
}

async function killChild (child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  child.kill('SIGTERM')
  await Promise.race([
    waitForClose(child),
    new Promise((resolve) => setTimeout(resolve, 3000))
  ])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await waitForClose(child)
  }
}

async function buildAudioPlayer (directory) {
  const playerPath = path.join(directory, 'play-audio-to-output-device')
  await runCommand('clang', [
    '-fobjc-arc',
    '-framework',
    'Foundation',
    '-framework',
    'AVFoundation',
    '-framework',
    'AudioToolbox',
    '-framework',
    'CoreAudio',
    playerSourcePath,
    '-o',
    playerPath
  ])
  return playerPath
}

async function generateSpeechFixture (directory) {
  const audioPath = path.join(directory, 'meeting-test.wav')
  await runCommand('say', [
    '-v',
    'Samantha',
    '-o',
    audioPath,
    '--data-format=LEI16@22050',
    'hello familiar meeting test'
  ])
  return audioPath
}

test('real transcriber receives generated audio through BlackHole', {
  skip: shouldRun ? false : 'Set FAMILIAR_REAL_AUDIO_TEST=1 on macOS with BlackHole installed.'
}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-real-audio-'))
  const playerPath = await buildAudioPlayer(directory)
  const audioPath = await generateSpeechFixture(directory)
  const child = spawn(helperPath, [], {
    env: {
      ...process.env,
      FAMILIAR_WHISPERKIT_MODEL: process.env.FAMILIAR_WHISPERKIT_MODEL || 'tiny'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const messages = collectJsonLines(child.stdout)
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf-8')
  })

  try {
    writeJsonLine(child.stdin, {
      id: 'start',
      command: 'start_capture',
      inputDeviceName: blackHoleDeviceName
    })
    const startResponse = await waitForMessage(
      messages,
      (message) => message.type === 'response' && message.id === 'start'
    )
    assert.equal(startResponse.ok, true)

    await runCommand(playerPath, [audioPath, blackHoleDeviceName])
    const transcript = await waitForMessage(messages, (message) => {
      const payload = message.type === 'event' ? message.payload : null
      const text = typeof payload?.text === 'string' ? payload.text.toLowerCase() : ''
      return text.includes('hello') && text.includes('familiar')
    }, 45000)

    assert.match(transcript.payload.text, /hello/i)
    assert.match(transcript.payload.text, /familiar/i)
    writeJsonLine(child.stdin, { id: 'stop', command: 'stop_capture' })
    const stopResponse = await waitForMessage(
      messages,
      (message) => message.type === 'response' && message.id === 'stop'
    )
    assert.equal(stopResponse.ok, true)
  } catch (error) {
    error.message = `${error.message}\nTranscriber stderr:\n${stderr}`
    throw error
  } finally {
    await killChild(child)
  }
})
