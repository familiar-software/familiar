const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  createTranscriptMarkdownFilename,
  resolveDefaultSpeechHelperPath,
  resolveMeetingSession
} = require('../src/meeting-recording/paths')

test('createTranscriptMarkdownFilename uses local timestamp transcript suffix', () => {
  const date = new Date(2026, 4, 30, 12, 34, 56, 789)

  assert.equal(
    createTranscriptMarkdownFilename(date),
    '2026-05-30T12-34-56-789.transcript.md'
  )
})

test('resolveMeetingSession creates only the timestamped markdown transcript path', () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-meeting-paths-'))
  const startedAt = new Date(2026, 4, 30, 12, 34, 56, 789)

  const session = resolveMeetingSession({
    contextFolderPath,
    preferredSessionId: 'session-2026-05-30T12-00-00-000',
    startedAt
  })

  assert.equal(session.sessionId, 'session-2026-05-30T12-00-00-000')
  assert.equal(
    path.basename(session.transcriptMarkdownPath),
    '2026-05-30T12-34-56-789.transcript.md'
  )
  assert.equal('transcriptJsonlPath' in session, false)
})

test('resolveDefaultSpeechHelperPath uses bundled speech helper when present', () => {
  const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-audio-resource-'))
  const helperPath = path.join(resourcesPath, 'familiar-speech-helper')
  fs.writeFileSync(helperPath, '')

  assert.equal(
    resolveDefaultSpeechHelperPath({ env: {}, resourcesPath }),
    helperPath
  )
})

test('resolveDefaultSpeechHelperPath finds dev speech helper', () => {
  const resolvedPath = resolveDefaultSpeechHelperPath({ env: {}, resourcesPath: '' })

  assert.equal(path.basename(resolvedPath), 'familiar-speech-helper')
  assert.equal(fs.existsSync(resolvedPath), true)
})
