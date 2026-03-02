const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Database = require('better-sqlite3')

const { createStillsQueue, resolveDbPath } = require('../src/screen-stills/stills-queue')

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-stills-queue-'))
  fs.mkdirSync(root, { recursive: true })
  return root
}

test('stills queue enqueues and processes rows', () => {
  const contextFolderPath = makeTempContext()
  const queue = createStillsQueue({ contextFolderPath, logger: { log: () => {} } })

  const imagePath = path.join(contextFolderPath, 'familiar', 'stills', 'session-1', 'frame.webp')
  const capturedAt = new Date().toISOString()

  const inserted = queue.enqueueCapture({
    imagePath,
    sessionId: 'session-1',
    capturedAt
  })

  assert.equal(inserted, true)

  const batch = queue.getPendingBatch(10)
  assert.equal(batch.length, 1)
  assert.equal(batch[0].image_path, imagePath)
  assert.equal(batch[0].app_name, null)
  assert.equal(batch[0].app_bundle_id, null)
  assert.equal(batch[0].app_title, null)
  assert.equal(batch[0].app_label_source, null)
  assert.equal(batch[0].visible_window_names, null)

  const marked = queue.markProcessing([batch[0].id])
  assert.equal(marked, 1)

  const done = queue.markDone({
    id: batch[0].id,
    markdownPath: path.join(contextFolderPath, 'familiar', 'stills-markdown', 'frame.md'),
    provider: 'openai',
    model: 'gpt-4o-mini'
  })
  assert.equal(done, 1)

  queue.close()
})

test('stills queue marks failed', () => {
  const contextFolderPath = makeTempContext()
  const queue = createStillsQueue({ contextFolderPath, logger: { log: () => {} } })

  const imagePath = path.join(contextFolderPath, 'familiar', 'stills', 'session-2', 'frame.webp')
  const capturedAt = new Date().toISOString()

  queue.enqueueCapture({
    imagePath,
    sessionId: 'session-2',
    capturedAt
  })

  const batch = queue.getPendingBatch(10)
  assert.equal(batch.length, 1)

  const marked = queue.markProcessing([batch[0].id])
  assert.equal(marked, 1)

  const failed = queue.markFailed({ id: batch[0].id, error: 'boom' })
  assert.equal(failed, 1)

  queue.close()
})

test('stills queue requeues stale processing rows on startup', () => {
  const contextFolderPath = makeTempContext()
  const queue = createStillsQueue({ contextFolderPath, logger: { log: () => {} } })

  const imagePath = path.join(contextFolderPath, 'familiar', 'stills', 'session-3', 'frame.webp')
  const capturedAt = new Date().toISOString()

  queue.enqueueCapture({
    imagePath,
    sessionId: 'session-3',
    capturedAt
  })

  const batch = queue.getPendingBatch(10)
  assert.equal(batch.length, 1)

  const marked = queue.markProcessing([batch[0].id])
  assert.equal(marked, 1)
  queue.close()

  const db = new Database(queue.dbPath)
  const staleUpdatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  db.prepare('UPDATE stills_queue SET updated_at = ? WHERE id = ?').run(staleUpdatedAt, batch[0].id)
  db.close()

  const restartedQueue = createStillsQueue({ contextFolderPath, logger: { log: () => {} } })
  const requeued = restartedQueue.requeueStaleProcessing({ olderThanMs: 30 * 60 * 1000 })
  const restartedBatch = restartedQueue.getPendingBatch(10)

  assert.equal(requeued, 1)
  assert.equal(restartedBatch.length, 1)
  assert.equal(restartedBatch[0].image_path, imagePath)

  restartedQueue.close()
})

test('stills queue markPending requeues work without discarding it', () => {
  const contextFolderPath = makeTempContext()
  const queue = createStillsQueue({ contextFolderPath, logger: { log: () => {} } })

  const imagePath = path.join(contextFolderPath, 'familiar', 'stills', 'session-4', 'frame.webp')
  const capturedAt = new Date().toISOString()

  queue.enqueueCapture({
    imagePath,
    sessionId: 'session-4',
    capturedAt
  })

  const batch = queue.getPendingBatch(10)
  assert.equal(batch.length, 1)

  queue.markProcessing([batch[0].id])

  const requeued = queue.markPending({ id: batch[0].id, error: 'offline' })
  assert.equal(requeued, 1)

  const ready = queue.getPendingBatch(10)
  assert.equal(ready.length, 1)
  assert.equal(ready[0].id, batch[0].id)

  queue.close()
})

test('stills queue stores app metadata when provided', () => {
  const contextFolderPath = makeTempContext()
  const queue = createStillsQueue({ contextFolderPath, logger: { log: () => {} } })

  const imagePath = path.join(contextFolderPath, 'familiar', 'stills', 'session-meta', 'frame.webp')
  const capturedAt = new Date().toISOString()

  queue.enqueueCapture({
    imagePath,
    sessionId: 'session-meta',
    capturedAt,
    appName: 'Code',
    appBundleId: 'com.microsoft.VSCode',
    appTitle: 'editor.js',
    appLabelSource: 'after',
    visibleWindowNames: ['Code', 'Terminal']
  })

  const batch = queue.getPendingBatch(10)
  assert.equal(batch.length, 1)
  assert.equal(batch[0].app_name, 'Code')
  assert.equal(batch[0].app_bundle_id, 'com.microsoft.VSCode')
  assert.equal(batch[0].app_title, 'editor.js')
  assert.equal(batch[0].app_label_source, 'after')
  assert.equal(batch[0].visible_window_names, JSON.stringify(['Code', 'Terminal']))

  queue.close()
})

test('stills queue migrates legacy schema and exposes app metadata columns', () => {
  const contextFolderPath = makeTempContext()
  const legacyDbPath = resolveDbPath(contextFolderPath)
  fs.mkdirSync(path.dirname(legacyDbPath), { recursive: true })

  const legacyDb = new Database(legacyDbPath)
  legacyDb.exec(`
    CREATE TABLE stills_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT UNIQUE NOT NULL,
      session_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      markdown_path TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stills_queue_status_captured
      ON stills_queue (status, captured_at);
  `)
  legacyDb.close()

  const queue = createStillsQueue({ contextFolderPath, logger: { log: () => {} } })
  const imagePath = path.join(contextFolderPath, 'familiar', 'stills', 'session-legacy', 'frame.webp')
  const capturedAt = new Date().toISOString()

  queue.enqueueCapture({
    imagePath,
    sessionId: 'session-legacy',
    capturedAt,
    appName: 'Terminal',
    appBundleId: 'com.apple.Terminal',
    appTitle: 'shell',
    appLabelSource: 'before',
    visibleWindowNames: ['Terminal', 'Safari']
  })

  const batch = queue.getPendingBatch(10)
  assert.equal(batch.length, 1)
  assert.equal(batch[0].app_name, 'Terminal')
  assert.equal(batch[0].app_bundle_id, 'com.apple.Terminal')
  assert.equal(batch[0].app_title, 'shell')
  assert.equal(batch[0].app_label_source, 'before')
  assert.equal(batch[0].visible_window_names, JSON.stringify(['Terminal', 'Safari']))

  const db = new Database(queue.dbPath)
  const columns = db.prepare('PRAGMA table_info(stills_queue)').all().map((row) => row.name)
  assert.equal(columns.includes('app_name'), true)
  assert.equal(columns.includes('app_bundle_id'), true)
  assert.equal(columns.includes('app_title'), true)
  assert.equal(columns.includes('app_label_source'), true)
  assert.equal(columns.includes('visible_window_names'), true)
  db.close()

  queue.close()
})
