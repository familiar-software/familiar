const HEARTBEAT_POLL_INTERVAL_MS = 60_000
const HEARTBEAT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const HEARTBEAT_DAY_OF_WEEK_VALUES = new Set([1, 2, 3, 4, 5, 6, 7])

const HEARTBEAT_RUNNERS = new Set(['codex', 'claude-code', 'cursor'])
const HEARTBEAT_FREQUENCIES = new Set(['daily', 'weekly'])
const WEEKDAY_LABELS = {
  Sun: 7,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
}
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

module.exports = {
  HEARTBEAT_POLL_INTERVAL_MS,
  HEARTBEAT_RUNNERS,
  HEARTBEAT_FREQUENCIES,
  HEARTBEAT_TIME_PATTERN,
  HEARTBEAT_DAY_OF_WEEK_VALUES,
  WEEKDAY_LABELS,
  DEFAULT_TIMEZONE
}
