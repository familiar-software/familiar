import { HEARTBEAT_DEFAULT_TIMEZONE } from '../../dashboard/dashboardConstants'

export const toSafeItems = (value) => (Array.isArray(value) ? value : [])

export const getLabel = (mc, entry = {}, fallback = '') => {
  if (entry && typeof entry.label === 'string' && entry.label.length > 0) {
    return entry.label
  }
  return fallback
}

export const nowMinutes = () => {
  const now = new Date()
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  return `${hour}:${minute}`
}

export const getSafeTime = (value) => {
  if (typeof value !== 'string') {
    return ''
  }
  const safe = value.trim()
  return /^\d{2}:\d{2}$/.test(safe) ? safe : ''
}

export const getSafeTimezone = (value) => {
  const candidate = typeof value === 'string' ? value.trim() : ''
  return candidate.length > 0 ? candidate : HEARTBEAT_DEFAULT_TIMEZONE
}

export const resolveRunnerLabel = (value) => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  return normalized === 'claude-code' ? 'Claude Code' : 'Codex'
}

export const resolveFrequencyLabel = (value) => (value === 'weekly' ? 'Weekly' : 'Daily')

export const resolveDayLabel = (value, labelLookup) => {
  const parsed = Number.parseInt(value, 10)
  const match = labelLookup.find((entry) => Number.parseInt(entry.value, 10) === parsed)
  return match?.label || 'Monday'
}

export const resolveLastRunText = (entry, toDisplayText) => {
  if (!entry) {
    return ''
  }
  if (!Number.isFinite(entry.lastRunAt) || entry.lastRunAt <= 0) {
    return toDisplayText('didnt run yet')
  }
  const dateText = new Date(entry.lastRunAt).toLocaleString()
  if (entry.lastRunStatus === 'error') {
    return `Failed at ${dateText}`
  }
  if (entry.lastRunStatus === 'skipped') {
    return `Skipped at ${dateText}`
  }
  return `Last run at ${dateText}`
}
