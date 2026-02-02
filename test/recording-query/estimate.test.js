const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { estimateRecordingQuery } = require('../../src/recording-query')

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-'))
  fs.mkdirSync(root, { recursive: true })
  return root
}

const writeSession = ({ contextFolderPath, sessionName, startedAt, endedAt }) => {
  const recordingsRoot = path.join(contextFolderPath, 'jiminy', 'recordings')
  const sessionDir = path.join(recordingsRoot, sessionName)
  fs.mkdirSync(sessionDir, { recursive: true })

  const manifest = {
    version: 1,
    startedAt,
    endedAt,
    segments: [
      { index: 1, file: 'segment-0001.mp4', startedAt, endedAt, durationMs: 90 * 60 * 1000 }
    ]
  }

  fs.writeFileSync(path.join(sessionDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  fs.writeFileSync(path.join(sessionDir, 'segment-0001.mp4'), '')
}

test('estimateRecordingQuery aggregates total duration', () => {
  const contextFolderPath = makeTempContext()
  writeSession({
    contextFolderPath,
    sessionName: 'session-one',
    startedAt: '2025-01-01T00:00:00.000Z',
    endedAt: '2025-01-01T01:30:00.000Z'
  })

  const result = estimateRecordingQuery({
    contextFolderPath,
    fromDate: '2025-01-01',
    toDate: '2025-01-01'
  })

  assert.equal(result.ok, true)
  assert.equal(result.totalDurationMs, 90 * 60 * 1000)
  assert.equal(result.totalSessions, 1)
  assert.equal(result.totalSegments, 1)
})

test('estimateRecordingQuery returns NO_SESSIONS when none overlap', () => {
  const contextFolderPath = makeTempContext()
  writeSession({
    contextFolderPath,
    sessionName: 'session-one',
    startedAt: '2025-01-01T00:00:00.000Z',
    endedAt: '2025-01-01T01:00:00.000Z'
  })

  const result = estimateRecordingQuery({
    contextFolderPath,
    fromDate: '2025-01-02',
    toDate: '2025-01-02'
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'NO_SESSIONS')
})
