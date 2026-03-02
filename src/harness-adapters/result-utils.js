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
  normalizeAdapterResult
}
