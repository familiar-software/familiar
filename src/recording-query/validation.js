const { toErrorResult } = require('./errors')

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const parseLocalDate = (value) => {
  if (typeof value !== 'string') {
    return null
  }
  const match = DATE_RE.exec(value)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

const parseDateRange = ({ fromDate, toDate }) => {
  const from = parseLocalDate(fromDate)
  const to = parseLocalDate(toDate)

  if (!from || !to) {
    return toErrorResult('INVALID_DATE', 'Both from and to dates are required.')
  }

  const start = new Date(from.year, from.month - 1, from.day, 0, 0, 0, 0)
  const end = new Date(to.year, to.month - 1, to.day, 23, 59, 59, 999)

  if (start.getTime() > end.getTime()) {
    return toErrorResult('INVALID_DATE_RANGE', 'From date must be before or equal to To date.')
  }

  return {
    ok: true,
    startMs: start.getTime(),
    endMs: end.getTime()
  }
}

const validateQuestion = (question) => {
  if (typeof question !== 'string' || question.trim().length === 0) {
    return toErrorResult('QUESTION_REQUIRED', 'Question is required.')
  }
  return { ok: true }
}

module.exports = {
  parseDateRange,
  validateQuestion
}
