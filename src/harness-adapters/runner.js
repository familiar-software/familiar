const { createHarnessAdapters } = require('./adapters')
const { resolveContextFolderPath, validateContextFolderPath } = require('./context')
const { ADAPTER_STATUS, DEFAULT_TIMEOUT_MS } = require('./types')
const { loadSettings } = require('../settings')

const createUnavailableResult = ({ harness, message } = {}) => ({
  status: ADAPTER_STATUS.UNAVAILABLE,
  answer: '',
  meta: {
    adapter: harness || ''
  },
  message: message || 'Adapter unavailable.'
})

const createErrorResult = ({ harness, message } = {}) => ({
  status: ADAPTER_STATUS.ERROR,
  answer: '',
  meta: {
    adapter: harness || ''
  },
  message: message || 'Adapter error.'
})

const createHarnessRunner = ({
  logger = console,
  adapters = createHarnessAdapters({ logger }),
  settingsLoader = loadSettings
} = {}) => {
  const getAdapterByHarness = (harness) => {
    const key = typeof harness === 'string' ? harness.trim().toLowerCase() : ''
    return adapters[key] || null
  }

  const checkAvailability = async ({ harness } = {}) => {
    const adapter = getAdapterByHarness(harness)
    if (!adapter) {
      return { ok: false, status: ADAPTER_STATUS.UNAVAILABLE, message: `Unsupported harness: ${harness}` }
    }
    return await adapter.checkAvailability()
  }

  const runPrompt = async ({
    harness,
    requestId = '',
    prompt = '',
    contextFolderPath = '',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    policyProfile = '',
    senderMetadata = null,
    workspaceDir = ''
  } = {}) => {
    const adapter = getAdapterByHarness(harness)
    if (!adapter) {
      return createUnavailableResult({
        harness,
        message: `Unsupported harness: ${harness}`
      })
    }

    const resolvedContextFolderPath = resolveContextFolderPath({
      contextFolderPath,
      settingsLoader
    })
    const contextValidation = validateContextFolderPath({
      contextFolderPath: resolvedContextFolderPath
    })

    if (!contextValidation.ok) {
      logger.warn('Harness adapter runPrompt rejected: invalid context folder path', {
        harness,
        requestId,
        message: contextValidation.message
      })
      return createErrorResult({
        harness,
        message: contextValidation.message
      })
    }

    logger.log('Harness adapter runPrompt dispatch', {
      harness,
      requestId,
      timeoutMs
    })

    try {
      const rawResult = await adapter.runPrompt({
        harness,
        requestId,
        prompt,
        contextFolderPath: contextValidation.contextFolderPath,
        timeoutMs,
        policyProfile,
        senderMetadata,
        workspaceDir
      })
      return adapter.normalizeResult(rawResult)
    } catch (error) {
      logger.error('Harness adapter runPrompt threw an unexpected error', {
        harness,
        requestId,
        message: error?.message || String(error)
      })
      return createErrorResult({
        harness,
        message: error?.message || 'Unknown adapter error.'
      })
    }
  }

  return {
    runPrompt,
    checkAvailability,
    adapters
  }
}

module.exports = {
  createHarnessRunner
}
