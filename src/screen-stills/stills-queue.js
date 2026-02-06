const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_DB_FILENAME } = require('../const')

const STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed'
})

const resolveDbPath = (contextFolderPath) =>
  path.join(contextFolderPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_DB_FILENAME)

const createStillsQueue = ({ contextFolderPath, logger = console } = {}) => {
  if (!contextFolderPath) {
    throw new Error('Context folder path is required for stills queue.')
  }

  const dbPath = resolveDbPath(contextFolderPath)
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS stills_queue (
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

  logger.log('Stills queue initialized', { dbPath })

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO stills_queue (
      image_path,
      session_id,
      captured_at,
      status,
      provider,
      model,
      markdown_path,
      last_error,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const pendingStmt = db.prepare(`
    SELECT id, image_path, session_id, captured_at
    FROM stills_queue
    WHERE status = ?
    ORDER BY captured_at ASC
    LIMIT ?
  `)

  const updateStatusStmt = db.prepare(`
    UPDATE stills_queue
    SET status = ?, updated_at = ?
    WHERE id = ?
  `)

  const updateProcessingStmt = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      return null
    }
    const placeholders = ids.map(() => '?').join(', ')
    return db.prepare(`
      UPDATE stills_queue
      SET status = ?, updated_at = ?
      WHERE status = ? AND id IN (${placeholders})
    `)
  }

  const updateDoneStmt = db.prepare(`
    UPDATE stills_queue
    SET status = ?, markdown_path = ?, provider = ?, model = ?, updated_at = ?
    WHERE id = ?
  `)

  const updateFailedStmt = db.prepare(`
    UPDATE stills_queue
    SET status = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `)

  const updateStaleProcessingStmt = db.prepare(`
    UPDATE stills_queue
    SET status = ?, updated_at = ?
    WHERE status = ? AND updated_at < ?
  `)

  const enqueueCapture = ({ imagePath, sessionId, capturedAt, provider, model } = {}) => {
    if (!imagePath) {
      throw new Error('imagePath is required to enqueue still capture.')
    }
    if (!sessionId) {
      throw new Error('sessionId is required to enqueue still capture.')
    }
    if (!capturedAt) {
      throw new Error('capturedAt is required to enqueue still capture.')
    }

    const now = new Date().toISOString()
    const info = insertStmt.run(
      imagePath,
      sessionId,
      capturedAt,
      STATUS.PENDING,
      provider || null,
      model || null,
      null,
      null,
      now,
      now
    )

    if (info.changes > 0) {
      logger.log('Enqueued still capture', { imagePath, sessionId, capturedAt })
    }

    return info.changes > 0
  }

  const getPendingBatch = (limit = 30) => {
    const resolvedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30
    return pendingStmt.all(STATUS.PENDING, resolvedLimit)
  }

  const markProcessing = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      return 0
    }
    const stmt = updateProcessingStmt(ids)
    if (!stmt) {
      return 0
    }
    const now = new Date().toISOString()
    const info = stmt.run(STATUS.PROCESSING, now, STATUS.PENDING, ...ids)
    return info.changes
  }

  const markDone = ({ id, markdownPath, provider, model } = {}) => {
    if (!id) {
      throw new Error('id is required to mark still as done.')
    }
    if (!markdownPath) {
      throw new Error('markdownPath is required to mark still as done.')
    }
    const now = new Date().toISOString()
    const info = updateDoneStmt.run(
      STATUS.DONE,
      markdownPath,
      provider || null,
      model || null,
      now,
      id
    )
    return info.changes
  }

  const markFailed = ({ id, error } = {}) => {
    if (!id) {
      throw new Error('id is required to mark still as failed.')
    }
    const now = new Date().toISOString()
    const message = error ? String(error) : 'unknown error'
    const info = updateFailedStmt.run(STATUS.FAILED, message, now, id)
    return info.changes
  }

  const requeueStaleProcessing = ({ olderThanMs } = {}) => {
    const resolvedOlderThanMs = Number.isFinite(olderThanMs) && olderThanMs > 0
      ? Math.floor(olderThanMs)
      : 0
    if (!resolvedOlderThanMs) {
      return 0
    }
    const cutoff = new Date(Date.now() - resolvedOlderThanMs).toISOString()
    const now = new Date().toISOString()
    const info = updateStaleProcessingStmt.run(
      STATUS.PENDING,
      now,
      STATUS.PROCESSING,
      cutoff
    )
    return info.changes
  }

  const close = () => {
    db.close()
  }

  return {
    STATUS,
    dbPath,
    enqueueCapture,
    getPendingBatch,
    markProcessing,
    markDone,
    markFailed,
    requeueStaleProcessing,
    close
  }
}

module.exports = {
  STATUS,
  resolveDbPath,
  createStillsQueue
}
