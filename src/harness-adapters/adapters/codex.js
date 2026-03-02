const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { runCommand } = require('../process-executor')
const { wrapPrompt } = require('../prompt-wrap')
const { resolveWorkspaceDir } = require('../context')
const { classifyCommandFailureStatus, normalizeAdapterResult } = require('../result-utils')
const { ADAPTER_STATUS, AVAILABILITY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } = require('../types')

const ADAPTER_NAME = 'codex'
const TOOL_NAME = 'codex'

const createMeta = ({ startedAt, durationMs, workspaceDir } = {}) => ({
  adapter: ADAPTER_NAME,
  tool: TOOL_NAME,
  durationMs: Number.isFinite(durationMs) ? durationMs : Math.max(0, Date.now() - startedAt),
  workspaceDir
})

const createCodexAdapter = ({
  logger = console,
  runCommandImpl = runCommand,
  now = () => Date.now()
} = {}) => {
  const checkAvailability = async () => {
    const commandResult = await runCommandImpl({
      command: 'codex',
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
      message: commandResult.error?.message || commandResult.stderr || 'Codex is unavailable.'
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

    logger.log('Harness adapter codex runPrompt started', {
      requestId,
      workspaceDir: resolvedWorkspaceDir,
      timeoutMs
    })

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-codex-adapter-'))
    const answerPath = path.join(tempDir, 'answer.txt')

    try {
      const commandResult = await runCommandImpl({
        command: 'codex',
        args: [
          'exec',
          '--sandbox',
          'read-only',
          '--skip-git-repo-check',
          '--cd',
          resolvedWorkspaceDir,
          '--output-last-message',
          answerPath,
          wrappedPrompt
        ],
        timeoutMs,
        logger
      })

      if (!commandResult.ok) {
        const status = classifyCommandFailureStatus(commandResult)
        logger.warn('Harness adapter codex runPrompt failed', {
          requestId,
          status,
          code: commandResult.code,
          signal: commandResult.signal,
          message: commandResult.error?.message || commandResult.stderr
        })
        return normalizeResult({
          status,
          answer: '',
          message: commandResult.error?.message || commandResult.stderr || 'Codex command failed.',
          meta: createMeta({
            startedAt,
            durationMs: commandResult.durationMs,
            workspaceDir: resolvedWorkspaceDir
          }),
          raw: commandResult
        })
      }

      const answerRaw = await fs.readFile(answerPath, 'utf8')
      const answer = answerRaw.trim()
      if (!answer) {
        logger.warn('Harness adapter codex runPrompt returned empty answer', {
          requestId,
          workspaceDir: resolvedWorkspaceDir
        })
        return normalizeResult({
          status: ADAPTER_STATUS.ERROR,
          answer: '',
          message: 'Codex returned an empty answer.',
          meta: createMeta({
            startedAt,
            durationMs: commandResult.durationMs,
            workspaceDir: resolvedWorkspaceDir
          }),
          raw: commandResult
        })
      }

      logger.log('Harness adapter codex runPrompt completed', {
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
    } catch (error) {
      logger.error('Harness adapter codex runPrompt threw an unexpected error', {
        requestId,
        workspaceDir: resolvedWorkspaceDir,
        message: error?.message || String(error)
      })
      return normalizeResult({
        status: ADAPTER_STATUS.ERROR,
        answer: '',
        message: error?.message || 'Unknown codex adapter error.',
        meta: createMeta({
          startedAt,
          durationMs: Math.max(0, now() - startedAt),
          workspaceDir: resolvedWorkspaceDir
        })
      })
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch((error) => {
        logger.warn('Failed to cleanup codex adapter temp directory', {
          requestId,
          tempDir,
          message: error?.message || String(error)
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
  createCodexAdapter
}
