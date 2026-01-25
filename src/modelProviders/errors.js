class ExhaustedLlmProviderError extends Error {
  constructor(message = 'LLM provider rate limit exhausted.') {
    super(message)
    this.name = 'ExhaustedLlmProviderError'
    this.code = 'exhaustedLlmProvider'
  }
}

class InvalidLlmProviderApiKeyError extends Error {
  constructor({ provider, status, message } = {}) {
    super(message || 'LLM API key is invalid.')
    this.name = 'InvalidLlmProviderApiKeyError'
    this.code = 'invalidApiKey'
    this.provider = provider
    this.status = status
  }
}

module.exports = {
  ExhaustedLlmProviderError,
  InvalidLlmProviderApiKeyError
}
