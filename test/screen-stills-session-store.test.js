const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createSessionStore } = require('../src/screen-stills/session-store')
const { formatLocalTimestamp } = require('../src/utils/timestamp-utils')

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-'))
  fs.mkdirSync(root, { recursive: true })
  return root
}

test('stills session store creates a timestamped session directory and capture filename', () => {
  const contextFolderPath = makeTempContext()
  const store = createSessionStore({
    contextFolderPath,
    format: 'webp'
  })

  assert.equal(store.sessionId.startsWith('session-'), true)
  assert.equal(fs.existsSync(store.sessionDir), true)

  const first = store.nextCaptureFile(new Date('2025-01-01T00:00:00.000Z'))
  assert.equal(first.fileName, `${formatLocalTimestamp(new Date('2025-01-01T00:00:00.000Z'))}.webp`)
  assert.equal(first.capturedAt, '2025-01-01T00:00:00.000Z')
})
