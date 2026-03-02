const { runCommand } = require('../process-executor')
const { wrapPrompt } = require('../prompt-wrap')
const { resolveWorkspaceDir } = require('../context')
const { classifyCommandFailureStatus, normalizeAdapterResult } = require('../result-utils')
const { ADAPTER_STATUS, AVAILABILITY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } = require('../types')

const ADAPTER_NAME = 'claude-code'
const TOOL_NAME = 'claude'

const createMeta = ({ startedAt, durationMs, workspaceDir } = {}) => ({
  adapter: ADAPTER_NAME,
  tool: TOOL_NAME,
  durationMs: Number.isFinite(durationMs) ? durationMs : Math.max(0, Date.now() - startedAt),
  workspaceDir
})

const createClaudeCodeAdapter = ({
  logger = console,
  runCommandImpl = runCommand,
  now = () => Date.now()
} = {}) => {
  const checkAvailability = async () => {
    const commandResult = await runCommandImpl({
      command: 'claude',
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
      message: commandResult.error?.message || commandResult.stderr || 'Claude Code is unavailable.'
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

    logger.log('Harness adapter claude-code runPrompt started', {
      requestId,
      workspaceDir: resolvedWorkspaceDir,
      timeoutMs
    })

    const commandResult = await runCommandImpl({
      command: 'claude',
      args: [
        '-p',
        '--output-format',
        'text',
        '--permission-mode',
        'plan',
        '--add-dir',
        contextFolderPath
      ],
      cwd: resolvedWorkspaceDir,
      input: wrappedPrompt,
      timeoutMs,
      logger
    })

    if (!commandResult.ok) {
      const status = classifyCommandFailureStatus(commandResult)
      logger.warn('Harness adapter claude-code runPrompt failed', {
        requestId,
        status,
        code: commandResult.code,
        signal: commandResult.signal,
        message: commandResult.error?.message || commandResult.stderr
      })
      return normalizeResult({
        status,
        answer: '',
        message: commandResult.error?.message || commandResult.stderr || 'Claude command failed.',
        meta: createMeta({
          startedAt,
          durationMs: commandResult.durationMs,
          workspaceDir: resolvedWorkspaceDir
        }),
        raw: commandResult
      })
    }

    const answer = typeof commandResult.stdout === 'string' ? commandResult.stdout.trim() : ''
    if (!answer) {
      logger.warn('Harness adapter claude-code runPrompt returned empty answer', {
        requestId,
        workspaceDir: resolvedWorkspaceDir
      })
      return normalizeResult({
        status: ADAPTER_STATUS.ERROR,
        answer: '',
        message: 'Claude Code returned an empty answer.',
        meta: createMeta({
          startedAt,
          durationMs: commandResult.durationMs,
          workspaceDir: resolvedWorkspaceDir
        }),
        raw: commandResult
      })
    }

    logger.log('Harness adapter claude-code runPrompt completed', {
      requestId,
      workspaceDir: resolvedWorkspaceDir,
      durationMs: commandResult.durationMs
    })
    return normalizeResult({
      status: ADAPTER_STATUS.OK,
      answer,
      meta: createMeta({
        startedAt,
        durationMs: commandResult.durationMs,
        workspaceDir: resolvedWorkspaceDir
      }),
      raw: commandResult
    })
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
  createClaudeCodeAdapter
}
