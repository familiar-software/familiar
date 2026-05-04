const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { scanOrphanStills } = require('../src/screen-stills/stills-recovery')
const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../src/const')

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-stills-recovery-'))
  fs.mkdirSync(root, { recursive: true })
  return root
}

const makeStillsDir = (contextFolderPath, sessionId) => {
  const dir = path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME, sessionId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const makeMarkdownDir = (contextFolderPath, sessionId) => {
  const dir = path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME, sessionId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

test('scanOrphanStills returns empty array when stills directory does not exist', () => {
  const contextFolderPath = makeTempContext()
  const orphans = scanOrphanStills({ contextFolderPath, logger: { warn: () => {} } })
  assert.deepEqual(orphans, [])
})

test('scanOrphanStills returns empty array when there are no .webp files', () => {
  const contextFolderPath = makeTempContext()
  makeStillsDir(contextFolderPath, 'session-empty')
  const orphans = scanOrphanStills({ contextFolderPath, logger: { warn: () => {} } })
  assert.deepEqual(orphans, [])
})

test('scanOrphanStills returns all webp files when no markdown directory exists', () => {
  const contextFolderPath = makeTempContext()
  const sessionId = 'session-nomd'
  const stillsDir = makeStillsDir(contextFolderPath, sessionId)
  fs.writeFileSync(path.join(stillsDir, '2026-01-01T10-00-00-000.webp'), 'img')
  fs.writeFileSync(path.join(stillsDir, '2026-01-01T10-00-05-000.webp'), 'img')

  const orphans = scanOrphanStills({ contextFolderPath, logger: { warn: () => {} } })

  assert.equal(orphans.length, 2)
  assert.ok(orphans.every((o) => o.sessionId === sessionId))
  assert.ok(orphans.every((o) => o.imagePath.endsWith('.webp')))
})

test('scanOrphanStills returns only webp files without a matching markdown', () => {
  const contextFolderPath = makeTempContext()
  const sessionId = 'session-mixed'
  const stillsDir = makeStillsDir(contextFolderPath, sessionId)
  const markdownDir = makeMarkdownDir(contextFolderPath, sessionId)

  fs.writeFileSync(path.join(stillsDir, '2026-01-01T10-00-00-000.webp'), 'img')
  fs.writeFileSync(path.join(stillsDir, '2026-01-01T10-00-05-000.webp'), 'img')
  // First still has a markdown; second does not
  fs.writeFileSync(path.join(markdownDir, '2026-01-01T10-00-00-000.md'), '# OCR')

  const orphans = scanOrphanStills({ contextFolderPath, logger: { warn: () => {} } })

  assert.equal(orphans.length, 1)
  assert.ok(orphans[0].imagePath.includes('2026-01-01T10-00-05-000.webp'))
  assert.equal(orphans[0].sessionId, sessionId)
})

test('scanOrphanStills parses capturedAt from the capture filename', () => {
  const contextFolderPath = makeTempContext()
  const sessionId = 'session-ts'
  const stillsDir = makeStillsDir(contextFolderPath, sessionId)
  fs.writeFileSync(path.join(stillsDir, '2026-03-15T09-30-45-123.webp'), 'img')

  const orphans = scanOrphanStills({ contextFolderPath, logger: { warn: () => {} } })

  assert.equal(orphans.length, 1)
  // The parsed ISO string should represent the local time encoded in the filename
  assert.ok(typeof orphans[0].capturedAt === 'string')
  assert.ok(orphans[0].capturedAt.length > 0)
  // Verify it parses as a valid date
  assert.ok(!Number.isNaN(Date.parse(orphans[0].capturedAt)))
})

test('scanOrphanStills falls back to file mtime when filename is not a parseable timestamp', () => {
  const contextFolderPath = makeTempContext()
  const sessionId = 'session-mtime'
  const stillsDir = makeStillsDir(contextFolderPath, sessionId)
  const weirdPath = path.join(stillsDir, 'not-a-timestamp.webp')
  fs.writeFileSync(weirdPath, 'img')

  const beforeMs = Date.now()
  const orphans = scanOrphanStills({ contextFolderPath, logger: { warn: () => {} } })
  const afterMs = Date.now()

  assert.equal(orphans.length, 1)
  const parsedMs = Date.parse(orphans[0].capturedAt)
  // capturedAt should be approximately the mtime (within a wide window)
  assert.ok(!Number.isNaN(parsedMs))
  assert.ok(parsedMs >= beforeMs - 5000 && parsedMs <= afterMs + 5000)
})

test('scanOrphanStills skips non-session directories and non-webp files', () => {
  const contextFolderPath = makeTempContext()
  const stillsRoot = path.join(
    contextFolderPath,
    FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
    STILLS_DIR_NAME
  )
  fs.mkdirSync(stillsRoot, { recursive: true })

  // A directory without the session- prefix should be ignored
  const notASession = path.join(stillsRoot, 'random-dir')
  fs.mkdirSync(notASession)
  fs.writeFileSync(path.join(notASession, 'frame.webp'), 'img')

  // A valid session dir with a non-webp file should produce no orphans
  const sessionDir = path.join(stillsRoot, 'session-skip')
  fs.mkdirSync(sessionDir)
  fs.writeFileSync(path.join(sessionDir, 'readme.txt'), 'text')

  const orphans = scanOrphanStills({ contextFolderPath, logger: { warn: () => {} } })
  assert.deepEqual(orphans, [])
})

test('scanOrphanStills returns empty array when all webp files have matching markdown', () => {
  const contextFolderPath = makeTempContext()
  const sessionId = 'session-complete'
  const stillsDir = makeStillsDir(contextFolderPath, sessionId)
  const markdownDir = makeMarkdownDir(contextFolderPath, sessionId)

  for (let i = 0; i < 3; i++) {
    const base = `2026-01-01T10-00-0${i}-000`
    fs.writeFileSync(path.join(stillsDir, `${base}.webp`), 'img')
    fs.writeFileSync(path.join(markdownDir, `${base}.md`), '# OCR')
  }

  const orphans = scanOrphanStills({ contextFolderPath, logger: { warn: () => {} } })
  assert.deepEqual(orphans, [])
})
