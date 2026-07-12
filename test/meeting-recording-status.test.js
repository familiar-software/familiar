const test = require('node:test')
const assert = require('node:assert/strict')

const { buildMeetingRecordingStatus } = require('../src/meeting-recording/status')

test('meeting recording availability applies to automatic capture as a whole', () => {
  const status = buildMeetingRecordingStatus({
    awakeLockActive: false,
    availability: 'unavailable',
    error: '',
    locale: 'en-US',
    session: null,
    state: 'idle',
    unavailableReason: 'Screen Recording access is required.'
  })

  assert.equal(status.isAvailable, false)
  assert.equal(status.unavailableReason, 'Screen Recording access is required.')
  assert.equal(Object.prototype.hasOwnProperty.call(status, 'captureProfile'), false)
})

test('meeting recording is available after all automatic requirements pass', () => {
  const status = buildMeetingRecordingStatus({
    awakeLockActive: false,
    availability: 'available',
    error: '',
    locale: 'en-US',
    session: null,
    state: 'idle',
    unavailableReason: ''
  })

  assert.equal(status.isAvailable, true)
  assert.equal(status.unavailableReason, '')
})
