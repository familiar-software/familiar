const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const appRoot = path.join(__dirname, '..')
const helperPath = path.join(appRoot, 'scripts', 'bin', 'familiar-speech-helper')
const playerSourcePath = path.join(appRoot, 'scripts', 'play-audio-to-output-device.m')
const blackHoleDeviceName = 'BlackHole 2ch'

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
  process.env.FAMILIAR_REAL_AUDIO_SMOKE_TIMEOUT_MS || '15000',
  10
)

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
    const { timeoutMs = 30000, ...spawnOptions } = options
    const child = spawn(command, args, {
      ...spawnOptions,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8')
    })
    child.once('close', (code) => {
      clearTimeout(timer)
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

function getProcessSnapshot (pid) {
  if (!Number.isInteger(pid)) {
    return 'Process pid is unavailable.'
  }

  const result = spawnSync('ps', [
    '-p',
    String(pid),
    '-o',
    'pid=,ppid=,stat=,etime=,command='
  ], {
    encoding: 'utf8',
    timeout: 2000
  })
  if (result.error) {
    return `Failed to inspect process ${pid}: ${result.error.message}`
  }

  const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
  return output || `Process ${pid} is no longer present.`
}

function getMacLogSnapshot () {
  if (process.platform !== 'darwin') {
    return 'macOS unified logs are unavailable on this platform.'
  }

  const result = spawnSync('/usr/bin/log', [
    'show',
    '--last',
    '5m',
    '--style',
    'compact',
    '--predicate',
    'process == "kernel" AND ' +
      '(eventMessage CONTAINS "familiar-speech-helper" OR ' +
      'eventMessage CONTAINS "load code signature error")'
  ], {
    encoding: 'utf8',
    timeout: 5000
  })
  if (result.error) {
    return `Failed to read macOS unified logs: ${result.error.message}`
  }

  const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
  return output.slice(-4000) || 'No recent helper code-signing log entries.'
}

function writeJsonLine (stream, value) {
  stream.write(`${JSON.stringify(value)}\n`)
}

function waitForMessage (messages, predicate, timeoutMs = 30000, label = 'audio message') {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const poll = () => {
      const message = messages.find(predicate)
      if (message) {
        resolve(message)
        return
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(
          `Timed out waiting for ${label}. Recent messages: ${JSON.stringify(messages.slice(-5))}`
        ))
        return
      }
      setTimeout(poll, 100)
    }
    poll()
  })
}

function waitForMessageOrClose ({
  child,
  messages,
  predicate,
  timeoutMs = 30000,
  label = 'audio message',
  getStderr = () => '',
  getProcessSnapshot = () => '',
  getSystemLogSnapshot = () => ''
}) {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    let pollTimer = null

    const cleanup = () => {
      if (pollTimer) {
        clearTimeout(pollTimer)
      }
      child.off('close', onClose)
    }

    const onClose = (code, signal) => {
      cleanup()
      reject(new Error(
        `Speech helper exited before ${label}: code ${code}, signal ${signal || ''}.\n` +
        `Recent messages: ${JSON.stringify(messages.slice(-5))}\n` +
        `Process snapshot:\n${getProcessSnapshot()}\n` +
        `Transcriber stderr:\n${getStderr()}\n` +
        `System log snapshot:\n${getSystemLogSnapshot()}`
      ))
    }

    const poll = () => {
      const message = messages.find(predicate)
      if (message) {
        cleanup()
        resolve(message)
        return
      }
      if (Date.now() - startedAt > timeoutMs) {
        cleanup()
        const recentMessages = JSON.stringify(messages.slice(-5))
        reject(new Error(
          `Timed out waiting for ${label}. Recent messages: ${recentMessages}\n` +
          `Process snapshot:\n${getProcessSnapshot()}\n` +
          `Transcriber stderr:\n${getStderr()}\n` +
          `System log snapshot:\n${getSystemLogSnapshot()}`
        ))
        return
      }
      pollTimer = setTimeout(poll, 100)
    }

    child.once('close', onClose)
    poll()
  })
}

function createStartCommand ({ id, inputDeviceName = '' }) {
  const command = { id, command: 'start_capture' }
  if (inputDeviceName) {
    command.inputDeviceName = inputDeviceName
  }
  return command
}

function releaseChildHandles (child) {
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    if (stream && !stream.destroyed) {
      stream.destroy()
    }
  }
  child.removeAllListeners()
  if (typeof child.unref === 'function') {
    child.unref()
  }
}

async function killChild (child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { closed: true, signal: child.signalCode, code: child.exitCode }
  }
  child.kill('SIGTERM')
  const gracefulClose = await Promise.race([
    waitForClose(child),
    new Promise((resolve) => setTimeout(() => resolve({ closed: false }), 3000))
  ])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    return await Promise.race([
      waitForClose(child).then((result) => ({ closed: true, ...result })),
      new Promise((resolve) => {
        setTimeout(() => {
          releaseChildHandles(child)
          resolve({ closed: false })
        }, 3000)
      })
    ])
  }
  return {
    closed: true,
    code: gracefulClose.code ?? child.exitCode,
    signal: gracefulClose.signal ?? child.signalCode
  }
}

test('real speech helper launches and responds before audio capture starts', {
  skip: shouldRunStartup
    ? false
    : 'Set FAMILIAR_REAL_AUDIO_STARTUP_TEST=1 on macOS to run the real helper smoke.'
}, async () => {
  const child = spawn(helperPath, [], {
    env: {
      ...process.env,
      FAMILIAR_WHISPERKIT_MODEL: process.env.FAMILIAR_WHISPERKIT_MODEL || 'tiny'
    },
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
      command: '__familiar_startup_smoke__'
    })
    const response = await waitForMessageOrClose({
      child,
      messages,
      predicate: (message) => message.type === 'response' && message.id === 'startup-smoke',
      timeoutMs: Number.isFinite(startupSmokeTimeoutMs) ? startupSmokeTimeoutMs : 15000,
      label: 'speech helper startup smoke response',
      getStderr: () => stderr,
      getProcessSnapshot: () => getProcessSnapshot(child.pid),
      getSystemLogSnapshot: getMacLogSnapshot
    })
    assert.equal(response.ok, false)
    assert.match(response.error, /Unsupported speech helper command/)
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
    env: {
      ...process.env,
      FAMILIAR_WHISPERKIT_MODEL: process.env.FAMILIAR_WHISPERKIT_MODEL || 'tiny'
    },
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
      assert.match(startResponse.error, /Microphone access was not granted/)
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
  skip: shouldRunBlackHole
    ? false
    : 'Set FAMILIAR_REAL_AUDIO_TEST=1 on macOS with BlackHole installed.'
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
  let primaryError = null
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf-8')
  })

  try {
    writeJsonLine(child.stdin, createStartCommand({
      id: 'start',
      inputDeviceName: blackHoleDeviceName
    }))
    const startResponse = await waitForMessage(
      messages,
      (message) => message.type === 'response' && message.id === 'start',
      120000,
      'speech helper start response'
    )
    assert.equal(startResponse.ok, true)

    await runCommand(playerPath, [audioPath, blackHoleDeviceName])
    const transcript = await waitForMessage(messages, (message) => {
      const payload = message.type === 'event' ? message.payload : null
      const text = typeof payload?.text === 'string' ? payload.text.toLowerCase() : ''
      return text.includes('hello') && text.includes('familiar')
    }, 45000, 'speech transcript event')

    assert.match(transcript.payload.text, /hello/i)
    assert.match(transcript.payload.text, /familiar/i)
    assert.ok(transcript.payload.segments?.some((segment) => segment.words?.length > 0))
    writeJsonLine(child.stdin, { id: 'stop', command: 'stop_capture' })
    const stopResponse = await waitForMessage(
      messages,
      (message) => message.type === 'response' && message.id === 'stop',
      120000,
      'speech helper stop response'
    )
    assert.equal(stopResponse.ok, true)
  } catch (error) {
    primaryError = error
    error.message = `${error.message}\nTranscriber stderr:\n${stderr}`
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
