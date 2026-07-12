const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createMeetingRecordingRequirements
} = require('../src/meeting-recording/requirements')

test('meeting recording requirements return validated paths', () => {
  const requirements = createMeetingRecordingRequirements({
    getContextFolderPath: () => '/tmp/context',
    resolveSpeechHelperPathImpl: () => __filename,
    validateContextFolderPathImpl: () => ({ ok: true })
  })

  assert.equal(requirements.resolveContextFolder(), '/tmp/context')
  assert.equal(requirements.resolveSpeechHelper(), __filename)
})

test('meeting recording requirements reject missing paths', () => {
  const requirements = createMeetingRecordingRequirements({
    getContextFolderPath: () => '/missing/context',
    resolveSpeechHelperPathImpl: () => '/missing/helper',
    validateContextFolderPathImpl: () => ({ ok: false, message: 'Invalid context.' })
  })

  assert.throws(() => requirements.resolveContextFolder(), /Invalid context/)
  assert.throws(() => requirements.resolveSpeechHelper(), /helper is not available/i)
})
