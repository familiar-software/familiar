const DEFAULT_OPTIONS = {
  retries: 3,
  minDelayMs: 200,
  maxDelayMs: 5000,
  backoffFactor: 2,
  jitter: 'full',
  logger: console,
  shouldRetry: () => true
}
const DEFAULT_HTTP_RETRY_OPTIONS = {
  retries: 2,
  minDelayMs: 250,
  maxDelayMs: 2000,
  backoffFactor: 2,
  jitter: 'full',
  logger: console
}
const DEFAULT_HTTP_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504])

class HttpRetryableError extends Error {
  constructor({ status, message, cause } = {}) {
    super(message || 'Retryable HTTP error')
    this.name = 'HttpRetryableError'
    this.status = status
    if (cause) {
      this.cause = cause
    }
  }
}

const toNumber = (value, fallback) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

const defaultSleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))

const normalizeOptions = (options = {}) => {
  const retries = Math.max(0, Math.floor(toNumber(options.retries, DEFAULT_OPTIONS.retries)))
  const minDelayMs = Math.max(0, toNumber(options.minDelayMs, DEFAULT_OPTIONS.minDelayMs))
  const maxDelayMs = Math.max(minDelayMs, toNumber(options.maxDelayMs, DEFAULT_OPTIONS.maxDelayMs))
  const backoffFactor = Math.max(1, toNumber(options.backoffFactor, DEFAULT_OPTIONS.backoffFactor))
  const jitter = typeof options.jitter === 'string' ? options.jitter : DEFAULT_OPTIONS.jitter
  const logger = options.logger ?? DEFAULT_OPTIONS.logger
  const shouldRetry = typeof options.shouldRetry === 'function' ? options.shouldRetry : DEFAULT_OPTIONS.shouldRetry
  const onRetry = typeof options.onRetry === 'function' ? options.onRetry : null
  const sleep = typeof options.sleep === 'function' ? options.sleep : defaultSleep
  const random = typeof options.random === 'function' ? options.random : Math.random

  return {
    retries,
    minDelayMs,
    maxDelayMs,
    backoffFactor,
    jitter,
    logger,
    shouldRetry,
    onRetry,
    sleep,
    random
  }
}

const applyJitter = (delayMs, jitter, random) => {
  if (jitter === 'none') {
    return delayMs
  }

  if (jitter === 'equal') {
    return Math.round(delayMs / 2 + random() * (delayMs / 2))
  }

  return Math.round(random() * delayMs)
}

const computeBackoffDelay = ({ attempt, minDelayMs, maxDelayMs, backoffFactor, jitter, random }) => {
  const exponentialDelay = minDelayMs * Math.pow(backoffFactor, Math.max(0, attempt - 1))
  const clampedDelay = Math.min(maxDelayMs, exponentialDelay)
  const roundedDelay = Math.round(clampedDelay)
  return applyJitter(roundedDelay, jitter, random)
}

const logRetry = (logger, payload) => {
  if (!logger || typeof logger.warn !== 'function') {
    return
  }

  logger.warn('Retrying operation', payload)
}

const retry = async (operation, options = {}) => {
  const config = normalizeOptions(options)
  const maxAttempts = Math.max(1, config.retries + 1)
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const shouldRetry = attempt < maxAttempts && await config.shouldRetry(error, { attempt, retries: config.retries })

      if (!shouldRetry) {
        throw error
      }

      const errorStatus = error && typeof error === 'object' && 'status' in error
        ? error.status
        : undefined
      const delayMs = computeBackoffDelay({
        attempt,
        minDelayMs: config.minDelayMs,
        maxDelayMs: config.maxDelayMs,
        backoffFactor: config.backoffFactor,
        jitter: config.jitter,
        random: config.random
      })

      const retryPayload = {
        attempt,
        retries: config.retries,
        delayMs,
        status: errorStatus,
        error: error instanceof Error ? error.message : String(error)
      }

      logRetry(config.logger, retryPayload)
      if (config.onRetry) {
        config.onRetry({ ...retryPayload, error })
      }

      if (delayMs > 0) {
        await config.sleep(delayMs)
      }
    }
  }

  throw lastError
}

const withRetry = (operation, options = {}) => {
  if (typeof operation !== 'function') {
    throw new TypeError('withRetry expects a function to decorate')
  }

  return async (...args) => retry(() => operation(...args), options)
}

const withHttpRetry = (fetchFn) => {
  if (typeof fetchFn !== 'function') {
    throw new TypeError('withHttpRetry expects a fetch function')
  }

  const retryConfig = {
    ...DEFAULT_HTTP_RETRY_OPTIONS,
    shouldRetry: (error) => error instanceof HttpRetryableError
  }

  return async (...args) => retry(async () => {
    try {
      const response = await fetchFn(...args)

      if (response.ok) {
        return response
      }

      if (DEFAULT_HTTP_RETRY_STATUSES.has(response.status)) {
        const message = await response.text()
        throw new HttpRetryableError({ status: response.status, message })
      }

      return response
    } catch (error) {
      if (error instanceof HttpRetryableError) {
        throw error
      }

      if (error instanceof Error) {
        throw new HttpRetryableError({ status: 'network', message: error.message, cause: error })
      }

      throw error
    }
  }, retryConfig)
}

module.exports = {
  DEFAULT_OPTIONS,
  DEFAULT_HTTP_RETRY_OPTIONS,
  DEFAULT_HTTP_RETRY_STATUSES,
  HttpRetryableError,
  computeBackoffDelay,
  retry,
  withRetry,
  withHttpRetry
}
