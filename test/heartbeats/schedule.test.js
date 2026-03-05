const test = require('node:test')
const assert = require('node:assert/strict')

const {
  convertZoneLocalToUtc,
  readDatePartsByTimeZone,
  computeLatestDueSlotMs,
  safeZonePartsTime
} = require('../../src/heartbeats/schedule')

test('computeLatestDueSlotMs returns today or yesterday for daily frequencies', () => {
  const nowMs = Date.UTC(2026, 2, 5, 12, 0, 0)
  const nowZoneParts = readDatePartsByTimeZone(nowMs, 'UTC')
  assert.ok(nowZoneParts)

  const duePast = computeLatestDueSlotMs({
    frequency: 'daily',
    schedule: { time: '11:00' },
    timeZone: 'UTC',
    nowMs,
    nowZoneParts
  })
  const expectedPast = Date.UTC(2026, 2, 5, 11, 0, 0)
  assert.equal(duePast, expectedPast)

  const dueFuture = computeLatestDueSlotMs({
    frequency: 'daily',
    schedule: { time: '13:00' },
    timeZone: 'UTC',
    nowMs,
    nowZoneParts
  })
  const expectedFuture = Date.UTC(2026, 2, 4, 13, 0, 0)
  assert.equal(dueFuture, expectedFuture)
})

test('computeLatestDueSlotMs resolves weekly due slot for same day and wraps previous week when needed', () => {
  const nowMs = Date.UTC(2026, 2, 5, 12, 0, 0)
  const nowZoneParts = readDatePartsByTimeZone(nowMs, 'UTC')
  assert.ok(nowZoneParts)

  const sameDayDue = computeLatestDueSlotMs({
    frequency: 'weekly',
    schedule: {
      time: '11:00',
      dayOfWeek: nowZoneParts.weekday
    },
    timeZone: 'UTC',
    nowMs,
    nowZoneParts
  })
  const expectedSameDay = Date.UTC(2026, 2, 5, 11, 0, 0)
  assert.equal(sameDayDue, expectedSameDay)

  const sameDayInFutureTime = computeLatestDueSlotMs({
    frequency: 'weekly',
    schedule: {
      time: '23:00',
      dayOfWeek: nowZoneParts.weekday
    },
    timeZone: 'UTC',
    nowMs,
    nowZoneParts
  })
  const expectedSameDayWrapped = Date.UTC(2026, 1, 26, 23, 0, 0)
  assert.equal(sameDayInFutureTime, expectedSameDayWrapped)
})

test('computeLatestDueSlotMs accepts invalid inputs with no result', () => {
  const nowMs = Date.UTC(2026, 2, 5, 12, 0, 0)
  const nowZoneParts = readDatePartsByTimeZone(nowMs, 'UTC')
  assert.ok(nowZoneParts)

  const invalidFrequency = computeLatestDueSlotMs({
    frequency: 'hourly',
    schedule: { time: '11:00' },
    timeZone: 'UTC',
    nowMs,
    nowZoneParts
  })
  assert.equal(invalidFrequency, null)

  const invalidWeeklyDay = computeLatestDueSlotMs({
    frequency: 'weekly',
    schedule: {
      time: '11:00',
      dayOfWeek: 9
    },
    timeZone: 'UTC',
    nowMs,
    nowZoneParts
  })
  assert.equal(invalidWeeklyDay, null)

  const invalidTimezoneParts = readDatePartsByTimeZone(nowMs, 'Not/A-Real-TimeZone')
  assert.equal(invalidTimezoneParts, null)
})

test('convertZoneLocalToUtc handles invalid timezone by returning null', () => {
  let warned = false
  const result = convertZoneLocalToUtc({
    year: 2026,
    month: 3,
    day: 5,
    hour: 12,
    minute: 0,
    timeZone: 'Invalid/TimeZone',
    logger: {
      warn: () => {
        warned = true
      }
    }
  })

  assert.equal(result, null)
  assert.equal(warned, true)
})

test('safeZonePartsTime returns null when formatter throws', () => {
  const formatter = {
    formatToParts: () => {
      throw new Error('broken formatter')
    }
  }

  const parts = safeZonePartsTime({ formatter, timestampMs: Date.now() })
  assert.equal(parts, null)
})
