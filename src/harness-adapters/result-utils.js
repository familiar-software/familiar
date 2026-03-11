const { ADAPTER_STATUS } = require('./types')

const VALID_STATUSES = new Set(Object.values(ADAPTER_STATUS))

const BLOCKED_MESSAGE_PATTERNS = [
  /permission/i,
  /not allowed/i,
  /denied/i,
  /blocked/i,
  /policy/i
]

const classifyCommandFailureStatus = ({ timedOut, error, stderr = '', stdout = '' } = {}) => {
  if (timedOut) {
    return ADAPTER_STATUS.TIMEOUT
  }

  if (error && error.code === 'ENOENT') {
    return ADAPTER_STATUS.UNAVAILABLE
  }

  const message = `${stderr}\n${stdout}\n${error?.message || ''}`
  const isBlocked = BLOCKED_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  if (isBlocked) {
    return ADAPTER_STATUS.BLOCKED
  }

  return ADAPTER_STATUS.ERROR
}

const trimMessage = (value) => (typeof value === 'string' ? value.trim() : '')

const formatCommandFailureMessage = ({ toolName = 'Command', commandResult = {} } = {}) => {
  const errorMessage = trimMessage(commandResult?.error?.message)
  if (errorMessage) {
    return errorMessage
  }

  const stderrMessage = trimMessage(commandResult?.stderr)
  if (stderrMessage) {
    return stderrMessage
  }

  const stdoutMessage = trimMessage(commandResult?.stdout)
  if (stdoutMessage) {
    return stdoutMessage
  }

  if (commandResult?.timedOut) {
    const durationMs = Number(commandResult?.durationMs)
    if (Number.isFinite(durationMs) && durationMs > 0) {
      return `${toolName} timed out after ${durationMs}ms.`
    }
    return `${toolName} timed out.`
  }

  const details = []
  if (Number.isInteger(commandResult?.code)) {
    details.push(`exit code ${commandResult.code}`)
  }
  const signal = trimMessage(commandResult?.signal)
  if (signal) {
    details.push(`signal ${signal}`)
  }

  if (details.length > 0) {
    return `${toolName} failed (${details.join(', ')}).`
  }

  return `${toolName} failed without an error message.`
}

const normalizeAdapterResult = ({ adapterName, rawResult } = {}) => {
  const raw = rawResult && typeof rawResult === 'object' ? rawResult : {}
  const status = VALID_STATUSES.has(raw.status) ? raw.status : ADAPTER_STATUS.ERROR
  const answer = typeof raw.answer === 'string' ? raw.answer : ''
  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {}

  return {
    status,
    answer,
    meta: {
      adapter: adapterName,
      ...meta
    },
    raw: raw.raw,
    message: typeof raw.message === 'string' ? raw.message : ''
  }
}

module.exports = {
  classifyCommandFailureStatus,
  formatCommandFailureMessage,
  normalizeAdapterResult
}
