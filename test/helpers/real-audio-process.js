const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')

const appRoot = path.join(__dirname, '..', '..')
const playerSourcePath = path.join(appRoot, 'scripts', 'play-audio-to-output-device.m')

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
          `Timed out waiting for ${label}. Recent messages: ` +
            JSON.stringify(messages.slice(-5))
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

async function generateSpeechFixture ({ directory, filename, voice, text }) {
  const audioPath = path.join(directory, filename)
  await runCommand('say', [
    '-v',
    voice,
    '-o',
    audioPath,
    '--data-format=LEI16@22050',
    text
  ])
  const { stdout } = await runCommand('afinfo', [audioPath])
  const durationMatch = stdout.match(/estimated duration:\s*([\d.]+)\s*sec/i)
  const durationSeconds = Number.parseFloat(durationMatch?.[1] || '')
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(
      `macOS say produced an empty speech fixture at ${audioPath}. ` +
      'Run real-audio tests outside the sandbox.'
    )
  }
  return audioPath
}

async function getInstalledVoiceNames () {
  const { stdout } = await runCommand('say', ['-v', '?'])
  const names = stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean)
  return new Set(names)
}

async function runDiarizationCapture ({
  helperPath,
  playerPath,
  audioPaths,
  inputDeviceName,
  interClipDelayMs = 750,
  timeoutMs = 120000
}) {
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

  const waitForHelperMessage = (predicate, label) => waitForMessageOrClose({
    child,
    messages,
    predicate,
    timeoutMs,
    label,
    getStderr: () => stderr,
    getProcessSnapshot: () => getProcessSnapshot(child.pid),
    getSystemLogSnapshot: getMacLogSnapshot
  })

  try {
    writeJsonLine(child.stdin, {
      id: 'start',
      command: 'start_capture',
      inputDeviceName
    })
    const startResponse = await waitForHelperMessage(
      (message) => message.type === 'response' && message.id === 'start',
      'speech helper start response'
    )
    if (startResponse.ok !== true) {
      throw new Error(startResponse.error || 'Speech helper failed to start capture.')
    }

    for (const [index, audioPath] of audioPaths.entries()) {
      await runCommand(playerPath, [audioPath, inputDeviceName])
      if (index < audioPaths.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, interClipDelayMs))
      }
    }
    writeJsonLine(child.stdin, { id: 'stop', command: 'stop_capture' })
    const stopResponse = await waitForHelperMessage(
      (message) => message.type === 'response' && message.id === 'stop',
      'speech helper stop response'
    )
    if (stopResponse.ok !== true) {
      throw new Error(stopResponse.error || 'Speech helper failed to stop capture.')
    }

    const transcript = messages.find((message) => {
      const payload = message.type === 'event' ? message.payload : null
      return payload?.isFinal === true && payload?.replaceTranscript === true
    })
    if (!transcript) {
      throw new Error(
        'Speech helper stopped without a final diarized transcript replacement event. ' +
        `Recent messages: ${JSON.stringify(messages.slice(-5))}`
      )
    }
    return { payload: transcript.payload, stderr }
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
    } else if (!cleanup.closed) {
      throw new Error('Speech helper did not exit during test cleanup.')
    }
  }
}

module.exports = {
  buildAudioPlayer,
  collectJsonLines,
  generateSpeechFixture,
  getInstalledVoiceNames,
  getMacLogSnapshot,
  getProcessSnapshot,
  killChild,
  runCommand,
  runDiarizationCapture,
  waitForMessage,
  waitForMessageOrClose,
  writeJsonLine
}
