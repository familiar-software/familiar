const ADAPTER_STATUS = Object.freeze({
  OK: 'ok',
  BLOCKED: 'blocked',
  TIMEOUT: 'timeout',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error'
})

const DEFAULT_TIMEOUT_MS = 120_000
const AVAILABILITY_TIMEOUT_MS = 3_000

module.exports = {
  ADAPTER_STATUS,
  DEFAULT_TIMEOUT_MS,
  AVAILABILITY_TIMEOUT_MS
}
