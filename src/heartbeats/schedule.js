const {
  WEEKDAY_LABELS,
  DEFAULT_TIMEZONE
} = require('./constants')
const {
  toSafeNumber
} = require('./utils')
const {
  normalizeHourAndMinute,
  resolveTimeParts
} = require('./normalize')

const createZoneDateFormatter = (timeZone) => {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  })
}

const getZoneDateParts = (date, formatter) => {
  const parts = formatter.formatToParts(date)
  const values = parts.reduce((acc, entry) => {
    if (entry.type !== 'literal') {
      acc[entry.type] = entry.value
    }
    return acc
  }, {})

  const year = Number.parseInt(values.year, 10)
  const month = Number.parseInt(values.month, 10)
  const day = Number.parseInt(values.day, 10)
  const hour = Number.parseInt(values.hour, 10)
  const minute = Number.parseInt(values.minute, 10)
  const second = Number.parseInt(values.second, 10)
  const weekdayLabel = values.weekday
  const weekday = WEEKDAY_LABELS[weekdayLabel]
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    !Number.isFinite(weekday)
  ) {
    return null
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday
  }
}

const convertZoneLocalToUtc = ({
  year,
  month,
  day,
  hour,
  minute,
  timeZone,
  logger = console
}) => {
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  if (!Number.isFinite(targetUtc)) {
    return null
  }

  let guess = targetUtc
  let formatter = null
  try {
    formatter = createZoneDateFormatter(timeZone)
  } catch (error) {
    logger.warn('Failed to create timezone formatter in heartbeat scheduler', {
      timeZone,
      message: error?.message || String(error)
    })
    return null
  }

  for (let index = 0; index < 5; index += 1) {
    const zoneParts = getZoneDateParts(new Date(guess), formatter)
    if (!zoneParts) {
      return null
    }

    const observedUtc = Date.UTC(
      zoneParts.year,
      zoneParts.month - 1,
      zoneParts.day,
      zoneParts.hour,
      zoneParts.minute,
      zoneParts.second,
      0
    )
    const delta = targetUtc - observedUtc
    if (delta === 0) {
      return guess
    }
    guess += delta
  }

  return guess
}

const readDatePartsByTimeZone = (dateMs, timezone) => {
  try {
    const formatter = createZoneDateFormatter(timezone)
    return getZoneDateParts(new Date(dateMs), formatter)
  } catch {
    return null
  }
}

const computeLatestDueSlotMs = ({
  frequency,
  schedule,
  timeZone,
  nowMs,
  nowZoneParts,
  logger = console
}) => {
  const normalized = resolveTimeParts({
    inputTime: schedule?.time,
    timezone: timeZone
  })
  if (!normalized || !nowZoneParts) {
    return null
  }

  const { hour, minute, time, timezone } = normalized
  if (frequency === 'daily') {
    const todayMs = convertZoneLocalToUtc({
      year: nowZoneParts.year,
      month: nowZoneParts.month,
      day: nowZoneParts.day,
      hour,
      minute,
      timeZone: timezone,
      logger
    })
    if (!Number.isFinite(todayMs)) {
      return null
    }
    if (todayMs > nowMs) {
      return convertZoneLocalToUtc({
        year: nowZoneParts.year,
        month: nowZoneParts.month,
        day: nowZoneParts.day - 1,
        hour,
        minute,
        timeZone: timezone,
        logger
      })
    }
    return todayMs
  }

  const requestedDay = toSafeNumber(schedule?.dayOfWeek, NaN)
  if (!Number.isFinite(requestedDay) || requestedDay < 1 || requestedDay > 7) {
    return null
  }

  let dayOffset = nowZoneParts.weekday - requestedDay
  if (dayOffset < 0) {
    dayOffset += 7
  }

  const weeklyMs = convertZoneLocalToUtc({
    year: nowZoneParts.year,
    month: nowZoneParts.month,
    day: nowZoneParts.day - dayOffset,
    hour,
    minute,
    timeZone: timezone,
    logger
  })
  if (!Number.isFinite(weeklyMs)) {
    return null
  }
  if (weeklyMs > nowMs) {
    return convertZoneLocalToUtc({
      year: nowZoneParts.year,
      month: nowZoneParts.month,
      day: nowZoneParts.day - dayOffset - 7,
      hour,
      minute,
      timeZone: timezone,
      logger
    })
  }

  return weeklyMs
}

const createDefaultFormatters = () => {
  const fallbackZoneFormatter = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })

  return {
    fallbackZoneFormatter,
    defaultTimezone: DEFAULT_TIMEZONE
  }
}

const safeZonePartsTime = ({ formatter, timestampMs }) => {
  try {
    const fallbackParts = formatter.formatToParts(new Date(timestampMs))
    return fallbackParts.reduce((acc, entry) => {
      if (entry.type !== 'literal') {
        acc[entry.type] = entry.value
      }
      return acc
    }, {})
  } catch {
    return null
  }
}

module.exports = {
  normalizeHourAndMinute,
  createZoneDateFormatter,
  getZoneDateParts,
  convertZoneLocalToUtc,
  readDatePartsByTimeZone,
  computeLatestDueSlotMs,
  createDefaultFormatters,
  safeZonePartsTime
}
