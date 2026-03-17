const {
  HEARTBEAT_DAY_OF_WEEK_VALUES,
  HEARTBEAT_FREQUENCIES,
  HEARTBEAT_RUNNERS,
  HEARTBEAT_TIME_PATTERN,
  DEFAULT_TIMEZONE
} = require('./constants')
const {
  toSafeNumber,
  toSafeString
} = require('./utils')

const normalizeRunner = (value) => {
  const next = toSafeString(value, '').toLowerCase()
  return HEARTBEAT_RUNNERS.has(next) ? next : null
}

const normalizeFrequency = (value) => {
  const next = toSafeString(value, '').toLowerCase()
  return HEARTBEAT_FREQUENCIES.has(next) ? next : null
}

const normalizeDayOfWeek = (value) => {
  const next = toSafeNumber(value, NaN)
  return HEARTBEAT_DAY_OF_WEEK_VALUES.has(next) ? next : null
}

const normalizeHourAndMinute = (time) => {
  const safeTime = toSafeString(time, '')
  const match = safeTime.match(HEARTBEAT_TIME_PATTERN)
  if (!match) {
    return null
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    time: safeTime
  }
}

const isTimeZoneSupported = (timeZone) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

const normalizeTimeZone = (value) => {
  const raw = toSafeString(value, DEFAULT_TIMEZONE)
  if (isTimeZoneSupported(raw)) {
    return raw
  }
  return DEFAULT_TIMEZONE
}

const normalizeHeartbeat = (raw, nowMs) => {
  const rawItem = raw && typeof raw === 'object' ? raw : null
  if (!rawItem) {
    return null
  }

  const id = toSafeString(rawItem.id)
  if (!id) {
    return null
  }

  const topic = toSafeString(rawItem.topic)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-|-$)/g, '')
  if (!topic || topic.length === 0) {
    return null
  }

  const prompt = toSafeString(rawItem.prompt)
  if (prompt.length === 0) {
    return null
  }

  const runner = normalizeRunner(rawItem.runner)
  if (!runner) {
    return null
  }

  const schedule = rawItem.schedule && typeof rawItem.schedule === 'object' ? rawItem.schedule : {}
  const frequency = normalizeFrequency(schedule.frequency)
  if (!frequency) {
    return null
  }

  const requestedTime = normalizeHourAndMinute(schedule.time)
  if (!requestedTime) {
    return null
  }

  const rawTimeZone = toSafeString(schedule.timezone, DEFAULT_TIMEZONE)
  const timezone = normalizeTimeZone(rawTimeZone)
  const dayOfWeek = frequency === 'weekly' ? normalizeDayOfWeek(schedule.dayOfWeek) : null
  if (frequency === 'weekly' && !dayOfWeek) {
    return null
  }

  return {
    id,
    topic,
    prompt: prompt.trim(),
    runner,
    outputFolderPath: toSafeString(rawItem.outputFolderPath),
    schedule: {
      frequency,
      dayOfWeek: dayOfWeek || 1,
      time: requestedTime.time,
      timezone
    },
    enabled: rawItem.enabled !== false,
    createdAt: toSafeNumber(rawItem.createdAt, nowMs),
    updatedAt: toSafeNumber(rawItem.updatedAt, nowMs),
    lastAttemptedScheduledAt: toSafeNumber(rawItem.lastAttemptedScheduledAt, 0),
    lastRunAt: toSafeNumber(rawItem.lastRunAt, 0),
    lastRunStatus: toSafeString(rawItem.lastRunStatus, ''),
    lastRunError: toSafeString(rawItem.lastRunError, ''),
    outputPath: toSafeString(rawItem.outputPath, '')
  }
}

const normalizeHeartbeats = ({
  items = [],
  logger,
  nowFn
}) => {
  const nowMs = toSafeNumber(nowFn(), Date.now())
  const normalized = []
  const normalizedByTopic = new Map()
  const warnings = []

  for (const raw of Array.isArray(items) ? items : []) {
    const next = normalizeHeartbeat(raw, nowMs)
    if (!next) {
      warnings.push('Dropped invalid heartbeat item')
      continue
    }

    const topicKey = next.topic.toLowerCase()
    const duplicate = normalizedByTopic.get(topicKey)
    if (duplicate) {
      warnings.push(`Dropped duplicate heartbeat topic: ${next.topic}`)
      continue
    }

    normalized.push(next)
    normalizedByTopic.set(topicKey, true)
  }

  if (warnings.length > 0 && logger) {
    for (const message of warnings) {
      logger.warn('Heartbeat item normalized', { message })
    }
  }

  return normalized
}

module.exports = {
  normalizeHeartbeat,
  normalizeHeartbeats,
  normalizeHourAndMinute,
  normalizeTimeZone,
  resolveTimeParts: ({ inputTime, timezone }) => {
    const normalizedTimezone = normalizeTimeZone(timezone)
    const normalizedTime = normalizeHourAndMinute(inputTime)
    return normalizedTime
      ? {
        time: normalizedTime.time,
        hour: normalizedTime.hour,
        minute: normalizedTime.minute,
        timezone: normalizedTimezone
      }
      : null
  }
}
