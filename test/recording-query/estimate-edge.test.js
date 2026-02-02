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

const writeSession = ({
  contextFolderPath,
  sessionName,
  startedAt,
  endedAt,
  segments,
  createFiles = true
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

  if (createFiles) {
    segments.forEach((segment) => {
      if (segment.file) {
        const segmentPath = path.join(sessionDir, segment.file)
        fs.writeFileSync(segmentPath, '')
      }
    })
  }
}

const buildLocalRange = (dateString) => {
  const [year, month, day] = dateString.split('-').map((value) => Number(value))
  const start = new Date(year, month - 1, day, 0, 0, 0, 0)
  const end = new Date(year, month - 1, day, 23, 59, 59, 999)
  return { start, end }
}

test('estimate returns zero when sessions have no segments', () => {
  const contextFolderPath = makeTempContext()
  const { start } = buildLocalRange('2025-01-10')
  writeSession({
    contextFolderPath,
    sessionName: 'session-empty',
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
    segments: []
  })

  const result = estimateRecordingQuery({
    contextFolderPath,
    fromDate: '2025-01-10',
    toDate: '2025-01-10'
  })

  assert.equal(result.ok, true)
  assert.equal(result.totalDurationMs, 0)
  assert.equal(result.totalSessions, 1)
  assert.equal(result.totalSegments, 0)
})

test('estimate skips malformed segments and counts valid durations only', () => {
  const contextFolderPath = makeTempContext()
  const { start } = buildLocalRange('2025-01-10')
  const beforeRangeStart = new Date(start.getTime() - 60 * 60 * 1000)
  const beforeRangeEnd = new Date(start.getTime() - 30 * 60 * 1000)
  const withinRangeStart = new Date(start.getTime() + 60 * 60 * 1000)
  const withinRangeEnd = new Date(start.getTime() + 90 * 60 * 1000)
  const laterRangeStart = new Date(start.getTime() + 4 * 60 * 60 * 1000)
  const laterRangeEnd = new Date(start.getTime() + 4 * 60 * 60 * 1000 + 10 * 60 * 1000)
  const validRangeStart = new Date(start.getTime() + 5 * 60 * 60 * 1000)
  const validRangeEnd = new Date(start.getTime() + 5 * 60 * 60 * 1000 + 30 * 60 * 1000)

  writeSession({
    contextFolderPath,
    sessionName: 'session-empty-segments',
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
    segments: []
  })

  writeSession({
    contextFolderPath,
    sessionName: 'session-missing-duration',
    startedAt: withinRangeStart.toISOString(),
    endedAt: withinRangeEnd.toISOString(),
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        startedAt: withinRangeStart.toISOString(),
        endedAt: new Date(withinRangeStart.getTime() + 10 * 60 * 1000).toISOString()
      }
    ]
  })

  writeSession({
    contextFolderPath,
    sessionName: 'session-missing-timestamps',
    startedAt: new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    endedAt: new Date(start.getTime() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        durationMs: 60 * 1000
      }
    ]
  })

  writeSession({
    contextFolderPath,
    sessionName: 'session-inverted-timestamps',
    startedAt: new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    endedAt: new Date(start.getTime() + 3 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        startedAt: new Date(start.getTime() + 3 * 60 * 60 * 1000 + 10 * 60 * 1000).toISOString(),
        endedAt: new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString(),
        durationMs: 60 * 1000
      }
    ]
  })

  writeSession({
    contextFolderPath,
    sessionName: 'session-outside-range',
    startedAt: beforeRangeStart.toISOString(),
    endedAt: withinRangeEnd.toISOString(),
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        startedAt: beforeRangeStart.toISOString(),
        endedAt: beforeRangeEnd.toISOString(),
        durationMs: 30 * 60 * 1000
      }
    ]
  })

  writeSession({
    contextFolderPath,
    sessionName: 'session-missing-file',
    startedAt: laterRangeStart.toISOString(),
    endedAt: new Date(laterRangeStart.getTime() + 30 * 60 * 1000).toISOString(),
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        startedAt: laterRangeStart.toISOString(),
        endedAt: laterRangeEnd.toISOString(),
        durationMs: 10 * 60 * 1000
      }
    ],
    createFiles: false
  })

  writeSession({
    contextFolderPath,
    sessionName: 'session-valid',
    startedAt: validRangeStart.toISOString(),
    endedAt: validRangeEnd.toISOString(),
    segments: [
      {
        index: 1,
        file: 'segment-0001.mp4',
        startedAt: validRangeStart.toISOString(),
        endedAt: validRangeEnd.toISOString(),
        durationMs: 30 * 60 * 1000
      }
    ]
  })

  const result = estimateRecordingQuery({
    contextFolderPath,
    fromDate: '2025-01-10',
    toDate: '2025-01-10'
  })

  assert.equal(result.ok, true)
  assert.equal(result.totalSessions, 7)
  assert.equal(result.totalSegments, 1)
  assert.equal(result.totalDurationMs, 30 * 60 * 1000)
})
