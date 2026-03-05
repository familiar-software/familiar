const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createHeartbeatRunner,
  HEARTBEAT_WORKSPACE_TEMP_FILE_WARNING
} = require('../../src/heartbeats/runner')
const { ADAPTER_STATUS, DEFAULT_TIMEOUT_MS } = require('../../src/harness-adapters/types')

const HEARTBEAT_PROMPT_SUFFIX = '\n do only what you are asked. dont ask any followup questions'
const HEARTBEAT_WORKSPACE_PATH = '/tmp'
const WORKSPACE_RESTRICTION_SUFFIX = `\nyou must not create any files outside of the workspace ${HEARTBEAT_WORKSPACE_PATH}. ${HEARTBEAT_WORKSPACE_TEMP_FILE_WARNING}`
const WORKSPACE_RESTRICTION_PHRASE = 'you must not create any files outside of the workspace'

const createHeartbeat = () => ({
  id: 'hb-1',
  topic: 'my-topic',
  runner: 'codex',
  prompt: 'Summarize my week'
})

test('createHeartbeatRunner appends no-followup suffix and passes adapter request fields', async () => {
  let input = null
  const runner = createHeartbeatRunner({
    harnessRunner: {
      runPrompt: async (request) => {
        input = request
        return {
          status: ADAPTER_STATUS.OK,
          answer: '  answer\n',
          meta: { durationMs: 3000 }
        }
      }
    }
  })

  const result = await runner.runHeartbeatRunner({
    heartbeat: createHeartbeat(),
    scheduledAtMs: 1_000,
    contextFolderPath: '/tmp'
  })

  assert.equal(input.harness, 'codex')
  assert.equal(input.requestId, 'heartbeat-hb-1')
  assert.equal(input.prompt, `Summarize my week${HEARTBEAT_PROMPT_SUFFIX}${WORKSPACE_RESTRICTION_SUFFIX}`)
  assert.equal(input.contextFolderPath, '/tmp')
  assert.equal(input.workspaceDir, '/tmp')
  assert.equal(input.timeoutMs, DEFAULT_TIMEOUT_MS)
  assert.equal(result.ok, true)
  assert.equal(result.status, 'ok')
  assert.equal(result.output, 'answer')
})

test('createHeartbeatRunner includes workspace restriction phrase to keep generated files inside workspace', async () => {
  let input = null
  const runner = createHeartbeatRunner({
    harnessRunner: {
      runPrompt: async (request) => {
        input = request
        return {
          status: ADAPTER_STATUS.OK,
          answer: '  answer\n',
          meta: { durationMs: 200 }
        }
      }
    }
  })

  await runner.runHeartbeatRunner({
    heartbeat: createHeartbeat(),
    scheduledAtMs: 2_000,
    contextFolderPath: HEARTBEAT_WORKSPACE_PATH
  })

  const workspaceRestriction = `you must not create any files outside of the workspace ${HEARTBEAT_WORKSPACE_PATH}`
  assert.ok(
    input?.prompt.includes(workspaceRestriction),
    'The heartbeat prompt must include the workspace-file restriction so the agent stays within the writable workspace and does not attempt writes outside the session boundary.'
  )
  assert.ok(
    input?.prompt.includes(WORKSPACE_RESTRICTION_PHRASE),
    'The workspace-file restriction phrase is required to reduce non-deterministic failures from temp-file writes outside the intended directory.'
  )
})

test('createHeartbeatRunner maps non-OK adapter result to error', async () => {
  const runner = createHeartbeatRunner({
    harnessRunner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.TIMEOUT,
        message: 'timed out'
      })
    }
  })

  const result = await runner.runHeartbeatRunner({
    heartbeat: createHeartbeat(),
    scheduledAtMs: 1_000,
    contextFolderPath: '/tmp'
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 'error')
  assert.equal(result.error, 'timed out')
})

test('createHeartbeatRunner returns default message when adapter returns no result', async () => {
  const runner = createHeartbeatRunner({
    harnessRunner: {
      runPrompt: async () => null
    }
  })

  const result = await runner.runHeartbeatRunner({
    heartbeat: createHeartbeat(),
    scheduledAtMs: 1_000,
    contextFolderPath: '/tmp'
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 'error')
  assert.equal(result.error, 'Runner returned no result')
})

test('createHeartbeatRunner throws when context folder path is missing', async () => {
  const runner = createHeartbeatRunner({
    harnessRunner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.OK,
        answer: 'should not be used'
      })
    }
  })

  await assert.rejects(
    () => runner.runHeartbeatRunner({
      heartbeat: createHeartbeat(),
      scheduledAtMs: 1_000,
      contextFolderPath: ''
    }),
    /Context folder path is required for heartbeat runs\./
  )
})

test('createHeartbeatRunner treats empty output as an error', async () => {
  const runner = createHeartbeatRunner({
    harnessRunner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.OK,
        answer: '   \n',
        meta: { durationMs: 10 }
      })
    }
  })

  const result = await runner.runHeartbeatRunner({
    heartbeat: createHeartbeat(),
    scheduledAtMs: 1_000,
    contextFolderPath: '/tmp'
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 'error')
  assert.equal(result.error, 'Heartbeat run result was empty.')
})
