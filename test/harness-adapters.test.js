const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createCodexAdapter } = require('../src/harness-adapters/adapters/codex')
const { createClaudeCodeAdapter } = require('../src/harness-adapters/adapters/claude-code')
const { createCursorAdapter } = require('../src/harness-adapters/adapters/cursor')
const { createHarnessRunner } = require('../src/harness-adapters/runner')
const { ADAPTER_STATUS } = require('../src/harness-adapters/types')

const createLogger = () => ({
  log: () => {},
  warn: () => {},
  error: () => {}
})

test('codex adapter runPrompt executes codex with writable workspace sandbox and returns answer', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-adapter-codex-'))
  const contextFolderPath = path.join(root, 'context')
  fs.mkdirSync(contextFolderPath, { recursive: true })

  let call = null
  const runCommandImpl = async (input) => {
    call = input
    const answerPathIndex = input.args.indexOf('--output-last-message')
    const answerPath = input.args[answerPathIndex + 1]
    fs.writeFileSync(answerPath, 'codex final answer')
    return {
      ok: true,
      code: 0,
      signal: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      durationMs: 35,
      error: null
    }
  }

  const adapter = createCodexAdapter({
    logger: createLogger(),
    runCommandImpl,
    now: () => 1_000
  })

  const result = await adapter.runPrompt({
    requestId: 'req-1',
    prompt: 'What happened today?',
    contextFolderPath,
    timeoutMs: 5_000
  })

  assert.equal(result.status, ADAPTER_STATUS.OK)
  assert.equal(result.answer, 'codex final answer')
  assert.equal(result.meta.adapter, 'codex')
  assert.equal(call.command, 'codex')
  assert.ok(call.args.includes('--sandbox'))
  assert.ok(call.args.includes('workspace-write'))
  assert.ok(call.args.includes('--skip-git-repo-check'))
  const cdIndex = call.args.indexOf('--cd')
  assert.notEqual(cdIndex, -1)
  assert.equal(call.args[cdIndex + 1], path.dirname(contextFolderPath))
  const wrappedPrompt = call.args[call.args.length - 1]
  assert.match(wrappedPrompt, /What happened today\?/)
  assert.match(wrappedPrompt, /context folder/i)
})

test('codex adapter checkAvailability maps ENOENT to unavailable', async () => {
  const adapter = createCodexAdapter({
    logger: createLogger(),
    runCommandImpl: async () => ({
      ok: false,
      code: null,
      signal: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      durationMs: 4,
      error: { code: 'ENOENT', message: 'spawn codex ENOENT' }
    })
  })

  const availability = await adapter.checkAvailability()
  assert.equal(availability.ok, false)
  assert.equal(availability.status, ADAPTER_STATUS.UNAVAILABLE)
})

test('claude-code adapter runPrompt pipes wrapped prompt through stdin and returns stdout answer', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-adapter-claude-'))
  const contextFolderPath = path.join(root, 'context')
  fs.mkdirSync(contextFolderPath, { recursive: true })

  let call = null
  const runCommandImpl = async (input) => {
    call = input
    return {
      ok: true,
      code: 0,
      signal: null,
      stdout: 'claude final answer\n',
      stderr: '',
      timedOut: false,
      durationMs: 44,
      error: null
    }
  }

  const adapter = createClaudeCodeAdapter({
    logger: createLogger(),
    runCommandImpl,
    now: () => 2_000
  })

  const result = await adapter.runPrompt({
    requestId: 'req-2',
    prompt: 'Summarize my day',
    contextFolderPath,
    timeoutMs: 6_000
  })

  assert.equal(result.status, ADAPTER_STATUS.OK)
  assert.equal(result.answer, 'claude final answer')
  assert.equal(result.meta.adapter, 'claude-code')
  assert.equal(call.command, 'claude')
  assert.equal(call.cwd, path.dirname(contextFolderPath))
  const addDirIndex = call.args.indexOf('--add-dir')
  assert.notEqual(addDirIndex, -1)
  assert.equal(call.args[addDirIndex + 1], contextFolderPath)
  assert.match(call.input, /Summarize my day/)
  assert.match(call.input, /context folder/i)
})

test('claude-code adapter maps timed out execution to timeout status', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-adapter-claude-timeout-'))
  const contextFolderPath = path.join(root, 'context')
  fs.mkdirSync(contextFolderPath, { recursive: true })

  const adapter = createClaudeCodeAdapter({
    logger: createLogger(),
    runCommandImpl: async () => ({
      ok: false,
      code: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: 'timed out',
      timedOut: true,
      durationMs: 101,
      error: null
    })
  })

  const result = await adapter.runPrompt({
    prompt: 'hello',
    contextFolderPath,
    timeoutMs: 10
  })

  assert.equal(result.status, ADAPTER_STATUS.TIMEOUT)
})

test('cursor adapter runPrompt executes cursor-agent in print mode and returns parsed JSON answer', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-adapter-cursor-'))
  const contextFolderPath = path.join(root, 'context')
  fs.mkdirSync(contextFolderPath, { recursive: true })

  let call = null
  const runCommandImpl = async (input) => {
    call = input
    return {
      ok: true,
      code: 0,
      signal: null,
      stdout: JSON.stringify({
        result: 'cursor final answer',
        is_error: false
      }),
      stderr: '',
      timedOut: false,
      durationMs: 52,
      error: null
    }
  }

  const adapter = createCursorAdapter({
    logger: createLogger(),
    runCommandImpl,
    now: () => 3_000
  })

  const result = await adapter.runPrompt({
    requestId: 'req-3',
    prompt: 'Summarize my familiar context',
    contextFolderPath,
    timeoutMs: 7_000
  })

  assert.equal(result.status, ADAPTER_STATUS.OK)
  assert.equal(result.answer, 'cursor final answer')
  assert.equal(result.meta.adapter, 'cursor')
  assert.equal(call.command, 'cursor-agent')
  assert.equal(call.cwd, path.dirname(contextFolderPath))
  assert.deepEqual(call.args.slice(0, 3), ['-p', '--output-format', 'json'])
  assert.match(call.args[call.args.length - 1], /Summarize my familiar context/)
  assert.match(call.args[call.args.length - 1], /context folder/i)
})

test('cursor adapter returns error when cursor-agent output is malformed JSON', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-adapter-cursor-bad-json-'))
  const contextFolderPath = path.join(root, 'context')
  fs.mkdirSync(contextFolderPath, { recursive: true })

  const adapter = createCursorAdapter({
    logger: createLogger(),
    runCommandImpl: async () => ({
      ok: true,
      code: 0,
      signal: null,
      stdout: '{not-json',
      stderr: '',
      timedOut: false,
      durationMs: 22,
      error: null
    })
  })

  const result = await adapter.runPrompt({
    prompt: 'hello',
    contextFolderPath,
    timeoutMs: 10
  })

  assert.equal(result.status, ADAPTER_STATUS.ERROR)
  assert.match(result.message, /json/i)
})

test('cursor adapter checkAvailability maps ENOENT to unavailable', async () => {
  const adapter = createCursorAdapter({
    logger: createLogger(),
    runCommandImpl: async () => ({
      ok: false,
      code: null,
      signal: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      durationMs: 4,
      error: { code: 'ENOENT', message: 'spawn cursor-agent ENOENT' }
    })
  })

  const availability = await adapter.checkAvailability()
  assert.equal(availability.ok, false)
  assert.equal(availability.status, ADAPTER_STATUS.UNAVAILABLE)
})

test('harness runner resolves context from settings and dispatches to adapter runPrompt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-runner-context-'))
  const contextFolderPath = path.join(root, 'context')
  fs.mkdirSync(contextFolderPath, { recursive: true })

  let adapterInput = null
  const fakeAdapter = {
    checkAvailability: async () => ({ ok: true }),
    runPrompt: async (input) => {
      adapterInput = input
      return {
        status: ADAPTER_STATUS.OK,
        answer: 'runner answer',
        meta: { adapter: 'claude-code' }
      }
    },
    normalizeResult: (value) => value
  }

  const runner = createHarnessRunner({
    logger: createLogger(),
    adapters: {
      claude: fakeAdapter,
      'claude-code': fakeAdapter
    },
    settingsLoader: () => ({ contextFolderPath })
  })

  const result = await runner.runPrompt({
    harness: 'claude-code',
    requestId: 'req-4',
    prompt: 'what did I do?'
  })

  assert.equal(result.status, ADAPTER_STATUS.OK)
  assert.equal(adapterInput.contextFolderPath, path.resolve(contextFolderPath))
  assert.equal(adapterInput.prompt, 'what did I do?')
})

test('harness runner dispatches cursor harness once adapter is registered', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-runner-cursor-'))
  const contextFolderPath = path.join(root, 'context')
  fs.mkdirSync(contextFolderPath, { recursive: true })

  let adapterInput = null
  const fakeAdapter = {
    checkAvailability: async () => ({ ok: true }),
    runPrompt: async (input) => {
      adapterInput = input
      return {
        status: ADAPTER_STATUS.OK,
        answer: 'cursor answer',
        meta: { adapter: 'cursor' }
      }
    },
    normalizeResult: (value) => value
  }

  const runner = createHarnessRunner({
    logger: createLogger(),
    adapters: { cursor: fakeAdapter },
    settingsLoader: () => ({ contextFolderPath })
  })

  const result = await runner.runPrompt({
    harness: 'cursor',
    prompt: 'hello'
  })

  assert.equal(result.status, ADAPTER_STATUS.OK)
  assert.equal(adapterInput.contextFolderPath, path.resolve(contextFolderPath))
  assert.equal(adapterInput.prompt, 'hello')
})

test('harness runner returns unavailable for unsupported harness', async () => {
  const runner = createHarnessRunner({
    logger: createLogger(),
    adapters: {},
    settingsLoader: () => ({})
  })

  const result = await runner.runPrompt({
    harness: 'gemini',
    prompt: 'hello'
  })

  assert.equal(result.status, ADAPTER_STATUS.UNAVAILABLE)
})
