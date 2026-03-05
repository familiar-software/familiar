const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveHeartbeatField } = require('../../src/dashboard/components/dashboard/heartbeat-utils.cjs')

test('resolveHeartbeatField uses schedule.frequency when top-level frequency is missing', () => {
  const payload = {
    id: 'hb-1',
    schedule: {
      frequency: 'daily',
      time: '09:00',
      timezone: 'UTC',
      dayOfWeek: '3'
    },
    enabled: true
  }

  assert.equal(resolveHeartbeatField(payload, 'frequency'), 'daily')
  assert.equal(resolveHeartbeatField(payload, 'time'), '09:00')
  assert.equal(resolveHeartbeatField(payload, 'timezone'), 'UTC')
  assert.equal(resolveHeartbeatField(payload, 'dayOfWeek'), '3')
})

test('resolveHeartbeatField keeps explicit top-level fields', () => {
  const payload = {
    id: 'hb-2',
    frequency: 'weekly',
    schedule: {
      frequency: 'daily',
      time: '08:00',
      timezone: 'America/New_York',
      dayOfWeek: '5'
    }
  }

  assert.equal(resolveHeartbeatField(payload, 'frequency'), 'weekly')
  assert.equal(resolveHeartbeatField(payload, 'time'), '08:00')
  assert.equal(resolveHeartbeatField(payload, 'timezone'), 'America/New_York')
  assert.equal(resolveHeartbeatField(payload, 'dayOfWeek'), '5')
})
