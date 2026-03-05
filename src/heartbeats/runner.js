const { ADAPTER_STATUS, DEFAULT_TIMEOUT_MS } = require('../harness-adapters/types')
const path = require('node:path')
const {
  toSafeNumber,
  toSafeString
} = require('./utils')

const logger = console
const HEARTBEAT_PROMPT_SUFFIX = '\n do only what you are asked. dont ask any followup questions'
const HEARTBEAT_WORKSPACE_FILE_RESTRICTION = (
  'you must not create any files outside of the workspace'
)
const HEARTBEAT_WORKSPACE_TEMP_FILE_WARNING = (
  'trying to do so will result in failure. if you need to create a temp file, creating it in this workspace'
)

const createHeartbeatRunner = ({
  harnessRunner,
  nowFn = () => Date.now()
} = {}) => {
  if (!harnessRunner || typeof harnessRunner.runPrompt !== 'function') {
    throw new Error('harnessRunner is required')
  }

  const runHeartbeatRunner = async ({
    heartbeat,
    scheduledAtMs,
    contextFolderPath
  }) => {
    const requestId = `heartbeat-${heartbeat.id}`
    const startedAt = nowFn()
    logger.log('Running heartbeat', {
      id: heartbeat.id,
      topic: heartbeat.topic,
      runner: heartbeat.runner,
      scheduledAtMs
    })
    const normalizedContextFolderPath = typeof contextFolderPath === 'string'
      ? contextFolderPath.trim()
      : ''
    if (!normalizedContextFolderPath) {
      throw new Error('Context folder path is required for heartbeat runs.')
    }

    const workspacePath = path.resolve(normalizedContextFolderPath)
    const workspaceSuffix = workspacePath
      ? `${HEARTBEAT_WORKSPACE_FILE_RESTRICTION} ${workspacePath}. ${HEARTBEAT_WORKSPACE_TEMP_FILE_WARNING}`
      : `${HEARTBEAT_WORKSPACE_FILE_RESTRICTION} this workspace. ${HEARTBEAT_WORKSPACE_TEMP_FILE_WARNING}`

    const result = await harnessRunner.runPrompt({
      harness: heartbeat.runner,
      requestId,
      prompt: `${heartbeat.prompt}${HEARTBEAT_PROMPT_SUFFIX}\n${workspaceSuffix}`,
      contextFolderPath,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      workspaceDir: contextFolderPath
    })

    if (!result || result.status !== ADAPTER_STATUS.OK) {
      const message = toSafeString(result?.message, 'Runner returned no result')
      logger.warn('Heartbeat runner failed', {
        id: heartbeat.id,
        topic: heartbeat.topic,
        status: result?.status,
        durationMs: toSafeNumber(result?.meta?.durationMs, nowFn() - startedAt),
        message
      })
      return {
        ok: false,
        status: 'error',
        error: message,
        output: ''
      }
    }

    const output = toSafeString(result.answer, '').trim()
    if (!output) {
      const message = 'Heartbeat run result was empty.'
      logger.warn('Heartbeat result empty', {
        id: heartbeat.id,
        topic: heartbeat.topic
      })
      return {
        ok: false,
        status: 'error',
        error: message,
        output
      }
    }

    return {
      ok: true,
      status: 'ok',
      output,
      error: ''
    }
  }

  return {
    runHeartbeatRunner
  }
}

module.exports = {
  createHeartbeatRunner,
  HEARTBEAT_WORKSPACE_TEMP_FILE_WARNING
}
