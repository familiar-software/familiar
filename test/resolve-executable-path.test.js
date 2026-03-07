const test = require('node:test')
const assert = require('node:assert/strict')

const {
  DEFAULT_RESOLVE_EXECUTABLE_TIMEOUT_MS,
  DEFAULT_SHELL_PATH,
  resolveExecutablePath
} = require('../src/utils/resolve-executable-path')

const createLogger = () => ({
  log: () => {},
  warn: () => {},
  error: () => {}
})

test('resolveExecutablePath uses a login zsh shell to resolve the executable path', async () => {
  let call = null
  const resolvedPath = await resolveExecutablePath('codex', {
    logger: createLogger(),
    runCommandImpl: async (input) => {
      call = input
      return {
        ok: true,
        code: 0,
        signal: null,
        stdout: '/Users/maximvovshin/.nvm/versions/node/v22.21.1/bin/codex\n',
        stderr: '',
        timedOut: false,
        durationMs: 12,
        error: null
      }
    }
  })

  assert.equal(resolvedPath, '/Users/maximvovshin/.nvm/versions/node/v22.21.1/bin/codex')
  assert.equal(call.command, DEFAULT_SHELL_PATH)
  assert.deepEqual(call.args, [
    '-ilc',
    'command -v "$1"',
    'resolve-executable-path',
    'codex'
  ])
  assert.equal(call.timeoutMs, DEFAULT_RESOLVE_EXECUTABLE_TIMEOUT_MS)
})

test('resolveExecutablePath returns empty when the login shell cannot resolve the command', async () => {
  const resolvedPath = await resolveExecutablePath('codex', {
    logger: createLogger(),
    runCommandImpl: async () => ({
      ok: false,
      code: 1,
      signal: null,
      stdout: '',
      stderr: 'codex not found',
      timedOut: false,
      durationMs: 8,
      error: null
    })
  })

  assert.equal(resolvedPath, '')
})

test('resolveExecutablePath returns empty for non-absolute shell output', async () => {
  const resolvedPath = await resolveExecutablePath('codex', {
    logger: createLogger(),
    runCommandImpl: async () => ({
      ok: true,
      code: 0,
      signal: null,
      stdout: 'codex\n',
      stderr: '',
      timedOut: false,
      durationMs: 9,
      error: null
    })
  })

  assert.equal(resolvedPath, '')
})
