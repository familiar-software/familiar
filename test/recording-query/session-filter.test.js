const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { filterRecordingSessions } = require('../../src/recording-query/session-filter')

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-'))
  fs.mkdirSync(root, { recursive: true })
  return root
}

const writeSession = ({
  contextFolderPath,
  sessionName,
  startedAt,
  endedAt,
  segments
}) => {
  const recordingsRoot = path.join(contextFolderPath, 'jiminy', 'recordings')
  const sessionDir = path.join(recordingsRoot, sessionName)
  fs.mkdirSync(sessionDir, { recursive: true })

  const manifest = {
    version: 1,
    startedAt,
    endedAt,
    segments
  }

  fs.writeFileSync(path.join(sessionDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

  segments.forEach((segment) => {
    if (segment.file) {
      const segmentPath = path.join(sessionDir, segment.file)
      fs.writeFileSync(segmentPath, '')
    }
  })

  return sessionDir
}

test('filters sessions that overlap the date range', () => {
  const contextFolderPath = makeTempContext()
  writeSession({
    contextFolderPath,
    sessionName: 'session-one',
    startedAt: '2025-01-01T00:00:00.000Z',
    endedAt: '2025-01-01T01:00:00.000Z',
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        startedAt: '2025-01-01T00:00:00.000Z',
        endedAt: '2025-01-01T00:30:00.000Z',
        durationMs: 30 * 60 * 1000
      },
      {
        index: 2,
        file: 'segment-0002.mp4',
        startedAt: '2025-01-01T00:30:00.000Z',
        endedAt: '2025-01-01T01:00:00.000Z',
        durationMs: 30 * 60 * 1000
      }
    ]
  })
  writeSession({
    contextFolderPath,
    sessionName: 'session-two',
    startedAt: '2025-01-03T00:00:00.000Z',
    endedAt: '2025-01-03T01:00:00.000Z',
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        startedAt: '2025-01-03T00:00:00.000Z',
        endedAt: '2025-01-03T01:00:00.000Z',
        durationMs: 60 * 60 * 1000
      }
    ]
  })

  const rangeStartMs = Date.parse('2025-01-01T00:00:00.000Z')
  const rangeEndMs = Date.parse('2025-01-01T23:59:59.999Z')

  const result = filterRecordingSessions({
    contextFolderPath,
    rangeStartMs,
    rangeEndMs,
    logger: console
  })

  assert.equal(result.ok, true)
  assert.equal(result.sessions.length, 1)
  assert.equal(result.allSegments.length, 2)
  assert.equal(result.totalSessions, 1)
  assert.equal(result.totalSegments, 2)
  assert.equal(result.totalDurationMs, 60 * 60 * 1000)
})

test('falls back to segment endedAt when session endedAt missing', () => {
  const contextFolderPath = makeTempContext()
  writeSession({
    contextFolderPath,
    sessionName: 'session-fallback',
    startedAt: '2025-02-01T00:00:00.000Z',
    endedAt: null,
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        startedAt: '2025-02-01T00:00:00.000Z',
        endedAt: '2025-02-01T00:10:00.000Z',
        durationMs: 10 * 60 * 1000
      }
    ]
  })

  const rangeStartMs = Date.parse('2025-02-01T00:00:00.000Z')
  const rangeEndMs = Date.parse('2025-02-01T23:59:59.999Z')

  const result = filterRecordingSessions({
    contextFolderPath,
    rangeStartMs,
    rangeEndMs,
    logger: console
  })

  assert.equal(result.ok, true)
  assert.equal(result.allSegments.length, 1)
  assert.equal(result.totalDurationMs, 10 * 60 * 1000)
})

test('returns NO_SEGMENTS when sessions have missing segments', () => {
  const contextFolderPath = makeTempContext()
  const recordingsRoot = path.join(contextFolderPath, 'jiminy', 'recordings')
  const sessionDir = path.join(recordingsRoot, 'session-missing')
  fs.mkdirSync(sessionDir, { recursive: true })

  const manifest = {
    version: 1,
    startedAt: '2025-03-01T00:00:00.000Z',
    endedAt: '2025-03-01T01:00:00.000Z',
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        startedAt: '2025-03-01T00:00:00.000Z',
        endedAt: '2025-03-01T01:00:00.000Z',
        durationMs: 60 * 60 * 1000
      }
    ]
  }
  fs.writeFileSync(path.join(sessionDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

  const rangeStartMs = Date.parse('2025-03-01T00:00:00.000Z')
  const rangeEndMs = Date.parse('2025-03-01T23:59:59.999Z')

  const result = filterRecordingSessions({
    contextFolderPath,
    rangeStartMs,
    rangeEndMs,
    logger: console
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'NO_SEGMENTS')
})

test('totals only overlapping duration within the selected range', () => {
  const contextFolderPath = makeTempContext()
  writeSession({
    contextFolderPath,
    sessionName: 'session-overlap',
    startedAt: '2025-01-30T23:00:00.000Z',
    endedAt: '2025-01-31T01:00:00.000Z',
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        startedAt: '2025-01-30T23:00:00.000Z',
        endedAt: '2025-01-30T23:30:00.000Z',
        durationMs: 30 * 60 * 1000
      },
      {
        index: 2,
        file: 'segment-0002.mp4',
        startedAt: '2025-01-31T00:10:00.000Z',
        endedAt: '2025-01-31T00:40:00.000Z',
        durationMs: 30 * 60 * 1000
      }
    ]
  })

  const rangeStartMs = Date.parse('2025-01-31T00:00:00.000Z')
  const rangeEndMs = Date.parse('2025-01-31T23:59:59.999Z')

  const result = filterRecordingSessions({
    contextFolderPath,
    rangeStartMs,
    rangeEndMs,
    logger: console
  })

  assert.equal(result.ok, true)
  assert.equal(result.totalDurationMs, 30 * 60 * 1000)
})
