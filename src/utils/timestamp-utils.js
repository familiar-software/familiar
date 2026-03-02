function padWithZero(value, width = 2) {
  return String(value).padStart(width, '0')
}

function formatLocalTimestamp(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid date for local timestamp format.')
  }

  return [
    date.getFullYear(),
    '-',
    padWithZero(date.getMonth() + 1),
    '-',
    padWithZero(date.getDate()),
    'T',
    padWithZero(date.getHours()),
    '-',
    padWithZero(date.getMinutes()),
    '-',
    padWithZero(date.getSeconds()),
    '-',
    padWithZero(date.getMilliseconds(), 3)
  ].join('')
}

function parseTimestampMs(timestamp = '') {
  if (typeof timestamp !== 'string' || timestamp.length === 0) {
    return null
  }

  const timestampMatch = timestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})(Z)?$/
  )
  if (!timestampMatch) {
    return null
  }

  const [, year, month, day, hour, minute, second, millisecond, isLegacy] = timestampMatch
  if (isLegacy === 'Z') {
    const legacyIso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}Z`
    const parsed = Date.parse(legacyIso)
    return Number.isFinite(parsed) ? parsed : null
  }

  const parsedDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond)
  )
  const parsedLocalMs = parsedDate.getTime()
  return Number.isFinite(parsedLocalMs) ? parsedLocalMs : null
}

module.exports = {
  formatLocalTimestamp,
  parseTimestampMs
}
