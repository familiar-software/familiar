const { spawn } = require('node:child_process')

const { DEFAULT_TIMEOUT_MS } = require('./types')

const FORCE_KILL_GRACE_MS = 10 * 60 * 1000

const normalizeTimeoutMs = (timeoutMs) => {
  const numericTimeout = Number(timeoutMs)
  if (!Number.isFinite(numericTimeout) || numericTimeout <= 0) {
    return DEFAULT_TIMEOUT_MS
  }
  return Math.floor(numericTimeout)
}

const runCommand = async ({
  command,
  args = [],
  cwd = undefined,
  input = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = console,
  spawnImpl = spawn
} = {}) => {
  const normalizedArgs = Array.isArray(args) ? args : []
  const normalizedTimeoutMs = normalizeTimeoutMs(timeoutMs)

  return await new Promise((resolve) => {
    let settled = false
    let timedOut = false
    let stdout = ''
    let stderr = ''
    let timeoutId = null
    let forceKillId = null
    const startedAt = Date.now()

    const settle = (payload) => {
      if (settled) {
        return
      }
      settled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (forceKillId) {
        clearTimeout(forceKillId)
      }
      resolve({
        ...payload,
        timedOut,
        durationMs: Date.now() - startedAt
      })
    }

    let child = null
    try {
      child = spawnImpl(command, normalizedArgs, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (error) {
      settle({
        ok: false,
        code: null,
        signal: null,
        stdout,
        stderr,
        error
      })
      return
    }

    timeoutId = setTimeout(() => {
      timedOut = true
      logger.warn('Harness adapter command timed out', {
        command,
        args: normalizedArgs,
        cwd: cwd || null,
        timeoutMs: normalizedTimeoutMs
      })
      child.kill('SIGTERM')
      forceKillId = setTimeout(() => {
        child.kill('SIGKILL')
      }, FORCE_KILL_GRACE_MS)
    }, normalizedTimeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      settle({
        ok: false,
        code: null,
        signal: null,
        stdout,
        stderr,
        error
      })
    })

    child.on('close', (code, signal) => {
      settle({
        ok: code === 0 && !timedOut,
        code,
        signal,
        stdout,
        stderr,
        error: null
      })
    })

    if (typeof input === 'string' && input.length > 0) {
      child.stdin.end(input)
      return
    }

    child.stdin.end()
  })
}

module.exports = {
  runCommand
}
