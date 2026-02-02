const test = require('node:test')
const assert = require('node:assert/strict')

const { getRecordingQueryAvailability } = require('../../src/recording-query/availability')

test('availability requires gemini provider and api key', () => {
  assert.deepEqual(getRecordingQueryAvailability({ provider: 'gemini', apiKey: 'key' }), { available: true })
  assert.equal(getRecordingQueryAvailability({ provider: 'openai', apiKey: 'key' }).available, false)
  assert.equal(getRecordingQueryAvailability({ provider: 'gemini', apiKey: '' }).available, false)
})
