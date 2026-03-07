const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeHeartbeat,
  normalizeHeartbeats
} = require('../../src/heartbeats/normalize')

const createWarnLogger = () => {
  const messages = []
  return {
    logger: {
      warn: (message, payload = {}) => {
        const nextMessage = typeof payload?.message === 'string'
          ? payload.message
          : typeof message === 'string'
            ? message
            : ''
        messages.push(nextMessage)
      }
    },
    messages
  }
}

test('normalizeHeartbeat drops invalid items and enforces required fields', () => {
  const result = normalizeHeartbeat({
    id: 'hb-1',
    topic: 'Team Weekly',
    prompt: '  summarize the week ',
    runner: 'codex',
    schedule: {
      frequency: 'daily',
      time: '07:30',
      timezone: 'UTC'
    }
  }, 10_000)

  assert.equal(result.id, 'hb-1')
  assert.equal(result.topic, 'team-weekly')
  assert.equal(result.prompt, 'summarize the week')
  assert.equal(result.runner, 'codex')
  assert.equal(result.schedule.frequency, 'daily')
  assert.equal(result.schedule.time, '07:30')
  assert.equal(result.schedule.timezone, 'UTC')
  assert.equal(result.schedule.dayOfWeek, 1)
  assert.equal(result.enabled, true)
})

test('normalizeHeartbeat drops entries with unsupported runner', () => {
  const result = normalizeHeartbeat({
    id: 'hb-2',
    topic: 'invalid runner',
    prompt: 'ask something',
    runner: 'unknown-model',
    schedule: {
      frequency: 'daily',
      time: '07:30',
      timezone: 'UTC'
    }
  }, 10_000)

  assert.equal(result, null)
})

test('normalizeHeartbeat keeps cursor as a supported runner', () => {
  const result = normalizeHeartbeat({
    id: 'hb-cursor',
    topic: 'Cursor Digest',
    prompt: 'summarize recent work',
    runner: 'cursor',
    schedule: {
      frequency: 'daily',
      time: '07:30',
      timezone: 'UTC'
    }
  }, 10_000)

  assert.equal(result?.runner, 'cursor')
})

test('normalizeHeartbeat requires valid weekly day', () => {
  const invalidWeekly = normalizeHeartbeat({
    id: 'hb-3',
    topic: 'bad weekly',
    prompt: 'ask something',
    runner: 'codex',
    schedule: {
      frequency: 'weekly',
      time: '07:30',
      dayOfWeek: 9,
      timezone: 'UTC'
    }
  }, 10_000)

  assert.equal(invalidWeekly, null)

  const validWeekly = normalizeHeartbeat({
    id: 'hb-4',
    topic: 'good weekly',
    prompt: 'ask something',
    runner: 'codex',
    schedule: {
      frequency: 'weekly',
      time: '07:30',
      dayOfWeek: 5,
      timezone: 'UTC'
    }
  }, 10_000)

  assert.equal(validWeekly?.schedule?.dayOfWeek, 5)
})

test('normalizeHeartbeats drops invalid and duplicate topics while logging warnings', () => {
  const { logger, messages } = createWarnLogger()
  const nowMs = 10_000
  const normalized = normalizeHeartbeats({
    items: [
      {
        id: 'hb-1',
        topic: 'Weekly Report',
        prompt: 'ask one',
        runner: 'codex',
        schedule: {
          frequency: 'daily',
          time: '07:30',
          timezone: 'UTC'
        }
      },
      {
        id: 'hb-2',
        topic: 'weekly report',
        prompt: 'ask duplicate',
        runner: 'codex',
        schedule: {
          frequency: 'daily',
          time: '07:30',
          timezone: 'UTC'
        }
      },
      {
        id: 'hb-3',
        prompt: 'missing topic',
        runner: 'codex',
        schedule: {
          frequency: 'daily',
          time: '07:30',
          timezone: 'UTC'
        }
      }
    ],
    logger,
    nowFn: () => nowMs
  })

  assert.equal(normalized.length, 1)
  assert.equal(normalized[0].id, 'hb-1')
  assert.equal(normalized[0].topic, 'weekly-report')
  assert.equal(messages.length, 2)
  assert.equal(
    messages.some((value) => value.includes('Dropped duplicate heartbeat topic')),
    true
  )
  assert.equal(
    messages.some((value) => value.includes('Dropped invalid heartbeat item')),
    true
  )
})
