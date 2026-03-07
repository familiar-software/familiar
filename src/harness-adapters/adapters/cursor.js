const { runCommand } = require('../process-executor')
const { wrapPrompt } = require('../prompt-wrap')
const { resolveWorkspaceDir } = require('../context')
const { classifyCommandFailureStatus, normalizeAdapterResult } = require('../result-utils')
const { ADAPTER_STATUS, AVAILABILITY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } = require('../types')

const ADAPTER_NAME = 'cursor'
const TOOL_NAME = 'cursor-agent'

const createMeta = ({ startedAt, durationMs, workspaceDir } = {}) => ({
  adapter: ADAPTER_NAME,
  tool: TOOL_NAME,
  durationMs: Number.isFinite(durationMs) ? durationMs : Math.max(0, Date.now() - startedAt),
  workspaceDir
})

const parseCursorAnswer = (stdout) => {
  const normalizedOutput = typeof stdout === 'string' ? stdout.trim() : ''
  if (!normalizedOutput) {
    return {
      ok: false,
      answer: '',
      message: 'Cursor returned an empty answer.'
    }
  }

  let parsed
  try {
    parsed = JSON.parse(normalizedOutput)
  } catch (error) {
    return {
      ok: false,
      answer: '',
      message: error?.message || 'Cursor returned invalid JSON.'
    }
  }

  if (parsed && typeof parsed === 'object' && parsed.is_error === true) {
    return {
      ok: false,
      answer: '',
      message: typeof parsed.error === 'string' && parsed.error.trim()
        ? parsed.error.trim()
        : 'Cursor returned an error result.'
    }
  }

  const answer = typeof parsed?.result === 'string' ? parsed.result.trim() : ''
  if (!answer) {
    return {
      ok: false,
      answer: '',
      message: 'Cursor returned an empty answer.'
    }
  }

  return {
    ok: true,
    answer,
    message: ''
  }
}

const createCursorAdapter = ({
  logger = console,
  runCommandImpl = runCommand,
  now = () => Date.now()
} = {}) => {
  const checkAvailability = async () => {
    const commandResult = await runCommandImpl({
      command: TOOL_NAME,
      args: ['--version'],
      timeoutMs: AVAILABILITY_TIMEOUT_MS,
      logger
    })

    if (commandResult.ok) {
      return { ok: true, adapter: ADAPTER_NAME }
    }

    const status = classifyCommandFailureStatus(commandResult)
    return {
      ok: false,
      adapter: ADAPTER_NAME,
      status,
      message: commandResult.error?.message || commandResult.stderr || 'Cursor is unavailable.'
    }
  }

  const runPrompt = async ({
    requestId = '',
    prompt = '',
    contextFolderPath,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    policyProfile = '',
    senderMetadata = null,
    workspaceDir = ''
  } = {}) => {
    const startedAt = now()
    const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : ''
    if (!normalizedPrompt) {
      return normalizeResult({
        status: ADAPTER_STATUS.ERROR,
        answer: '',
        message: 'Prompt is required.',
        meta: createMeta({ startedAt, durationMs: 0, workspaceDir: '' })
      })
    }

    const resolvedWorkspaceDir = resolveWorkspaceDir({
      contextFolderPath,
      workspaceDir
    })
    const wrappedPrompt = wrapPrompt({
      userPrompt: normalizedPrompt,
      contextFolderPath,
      policyProfile,
      senderMetadata
    })

    logger.log('Harness adapter cursor runPrompt started', {
      requestId,
      workspaceDir: resolvedWorkspaceDir,
      timeoutMs
    })

    try {
      const commandResult = await runCommandImpl({
        command: TOOL_NAME,
        args: [
          '-p',
          '--output-format',
          'json',
          wrappedPrompt
        ],
        cwd: resolvedWorkspaceDir,
        timeoutMs,
        logger
      })

      if (!commandResult.ok) {
        const status = classifyCommandFailureStatus(commandResult)
        logger.warn('Harness adapter cursor runPrompt failed', {
          requestId,
          status,
          code: commandResult.code,
          signal: commandResult.signal,
          message: commandResult.error?.message || commandResult.stderr
        })
        return normalizeResult({
          status,
          answer: '',
          message: commandResult.error?.message || commandResult.stderr || 'Cursor command failed.',
          meta: createMeta({
            startedAt,
            durationMs: commandResult.durationMs,
            workspaceDir: resolvedWorkspaceDir
          }),
          raw: commandResult
        })
      }

      const parsedAnswer = parseCursorAnswer(commandResult.stdout)
      if (!parsedAnswer.ok) {
        logger.warn('Harness adapter cursor runPrompt returned invalid answer payload', {
          requestId,
          workspaceDir: resolvedWorkspaceDir,
          message: parsedAnswer.message
        })
        return normalizeResult({
          status: ADAPTER_STATUS.ERROR,
          answer: '',
          message: parsedAnswer.message,
          meta: createMeta({
            startedAt,
            durationMs: commandResult.durationMs,
            workspaceDir: resolvedWorkspaceDir
          }),
          raw: commandResult
        })
      }

      logger.log('Harness adapter cursor runPrompt completed', {
        requestId,
        workspaceDir: resolvedWorkspaceDir,
        durationMs: commandResult.durationMs
      })
      return normalizeResult({
        status: ADAPTER_STATUS.OK,
        answer: parsedAnswer.answer,
        meta: createMeta({
          startedAt,
          durationMs: commandResult.durationMs,
          workspaceDir: resolvedWorkspaceDir
        }),
        raw: commandResult
      })
    } catch (error) {
      logger.error('Harness adapter cursor runPrompt threw an unexpected error', {
        requestId,
        workspaceDir: resolvedWorkspaceDir,
        message: error?.message || String(error)
      })
      return normalizeResult({
        status: ADAPTER_STATUS.ERROR,
        answer: '',
        message: error?.message || 'Unknown cursor adapter error.',
        meta: createMeta({
          startedAt,
          durationMs: Math.max(0, now() - startedAt),
          workspaceDir: resolvedWorkspaceDir
        })
      })
    }
  }

  const normalizeResult = (rawResult) => normalizeAdapterResult({
    adapterName: ADAPTER_NAME,
    rawResult
  })

  return {
    name: ADAPTER_NAME,
    checkAvailability,
    runPrompt,
    normalizeResult
  }
}

module.exports = {
  createCursorAdapter
}
