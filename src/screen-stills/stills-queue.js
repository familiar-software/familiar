const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DB_FILENAME } = require('../const')
const { normalizeAppString } = require('../utils/strings')
const { scanOrphanStills } = require('./stills-recovery')

const STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed'
})

const resolveDbPath = (contextFolderPath) =>
  path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DB_FILENAME)

const normalizeVisibleWindowNames = (visibleWindowNames) => {
  if (Array.isArray(visibleWindowNames)) {
    return visibleWindowNames.length > 0 ? JSON.stringify(visibleWindowNames) : null
  }

  if (typeof visibleWindowNames === 'string') {
    return normalizeAppString(visibleWindowNames, null)
  }

  return null
}

/**
 * Returns true when the error indicates SQLite file-level corruption.
 * Covers the SQLITE_CORRUPT and SQLITE_NOTADB error codes as well as the
 * "database disk image is malformed" message that appears in some versions.
 */
const isCorruptionError = (err) => {
  if (!err) return false
  if (err.code === 'SQLITE_CORRUPT' || err.code === 'SQLITE_NOTADB') return true
  const msg = typeof err.message === 'string' ? err.message.toLowerCase() : ''
  return (
    msg.includes('database disk image is malformed') ||
    msg.includes('file is not a database')
  )
}

/**
 * Rename stills.db to stills.db.corrupt-<timestamp> and delete any leftover
 * WAL/SHM sidecar files.  Returns the quarantine path.
 */
const quarantineDbFiles = (dbPath) => {
  const suffix = new Date().toISOString().replace(/[:.]/g, '-')
  const quarantinePath = `${dbPath}.corrupt-${suffix}`
  try { fs.renameSync(dbPath, quarantinePath) } catch (_) {}
  for (const ext of ['-wal', '-shm']) {
    try { fs.unlinkSync(`${dbPath}${ext}`) } catch (_) {}
  }
  return quarantinePath
}

const createStillsQueue = ({ contextFolderPath, logger = console, onRecovery = null } = {}) => {
  if (!contextFolderPath) {
    throw new Error('Context folder path is required for stills queue.')
  }

  const dbPath = resolveDbPath(contextFolderPath)
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  // Mutable DB handle and prepared statements — replaced on recovery
  let db = null
  let stmts = {}
  let recovering = false

  const openDb = () => {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
  }

  const initSchema = () => {
    const existingColumns = []
    const ensureColumn = (name, ddl) => {
      if (existingColumns.includes(name)) return
      db.exec(`ALTER TABLE stills_queue ADD COLUMN ${ddl}`)
      existingColumns.push(name)
    }

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
        app_name TEXT,
        app_bundle_id TEXT,
        app_title TEXT,
        app_label_source TEXT,
        visible_window_names TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_stills_queue_status_captured
        ON stills_queue (status, captured_at);
    `)
    const tableInfo = db.prepare('PRAGMA table_info(stills_queue)').all()
    existingColumns.push(
      ...Array.isArray(tableInfo) ? tableInfo.map((row) => row?.name).filter(Boolean) : []
    )

    ensureColumn('app_name', 'app_name TEXT')
    ensureColumn('app_bundle_id', 'app_bundle_id TEXT')
    ensureColumn('app_title', 'app_title TEXT')
    ensureColumn('app_label_source', 'app_label_source TEXT')
    ensureColumn('visible_window_names', 'visible_window_names TEXT')
  }

  const prepareStatements = () => {
    stmts.insert = db.prepare(`
      INSERT OR IGNORE INTO stills_queue (
        image_path,
        session_id,
        captured_at,
        status,
        provider,
        model,
        markdown_path,
        last_error,
        app_name,
        app_bundle_id,
        app_title,
        app_label_source,
        visible_window_names,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmts.pending = db.prepare(`
      SELECT
        id,
        image_path,
        session_id,
        captured_at,
        app_name,
        app_bundle_id,
        app_title,
        app_label_source,
        visible_window_names
      FROM stills_queue
      WHERE status = ?
      ORDER BY captured_at ASC
      LIMIT ?
    `)

    stmts.updateStatus = db.prepare(`
      UPDATE stills_queue
      SET status = ?, updated_at = ?
      WHERE id = ?
    `)

    stmts.updateDone = db.prepare(`
      UPDATE stills_queue
      SET status = ?,
          markdown_path = ?,
          provider = ?,
          model = ?,
          last_error = NULL,
          updated_at = ?
      WHERE id = ?
    `)

    stmts.updateFailed = db.prepare(`
      UPDATE stills_queue
      SET status = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `)

    stmts.updatePendingWithError = db.prepare(`
      UPDATE stills_queue
      SET status = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `)

    stmts.updateStaleProcessing = db.prepare(`
      UPDATE stills_queue
      SET status = ?, updated_at = ?
      WHERE status = ? AND updated_at < ?
    `)
  }

  const initDb = () => {
    openDb()
    initSchema()
    prepareStatements()
  }

  /**
   * Open a read-only probe connection to check whether the on-disk stills.db
   * is healthy.  If it is, return null (no quarantine needed — another
   * connection already replaced the file).  If it is corrupt, quarantine it
   * and return the quarantine path.
   */
  const checkAndMaybeQuarantine = () => {
    let shouldQuarantine = true
    try {
      const probe = new Database(dbPath, { readonly: true })
      const result = probe.pragma('integrity_check')
      const ok = Array.isArray(result) && result.length === 1 && result[0]?.integrity_check === 'ok'
      probe.close()
      shouldQuarantine = !ok
    } catch (_) {
      // Probe failed — file is still corrupt or missing
      shouldQuarantine = true
    }
    if (!shouldQuarantine) return null
    return quarantineDbFiles(dbPath)
  }

  const enqueueOrphans = () => {
    let requeuedCount = 0
    try {
      const orphans = scanOrphanStills({ contextFolderPath, logger })
      for (const orphan of orphans) {
        try {
          const now = new Date().toISOString()
          const info = stmts.insert.run(
            orphan.imagePath,
            orphan.sessionId,
            orphan.capturedAt,
            STATUS.PENDING,
            null, null, null, null,
            null, null, null, null, null,
            now, now
          )
          if (info.changes > 0) requeuedCount++
        } catch (enqueueErr) {
          logger.error('Failed to requeue orphan still after DB recovery', {
            imagePath: orphan.imagePath,
            error: enqueueErr?.message || String(enqueueErr)
          })
        }
      }
    } catch (scanErr) {
      logger.error('Failed to scan orphan stills after DB recovery', {
        error: scanErr?.message || String(scanErr)
      })
    }
    return requeuedCount
  }

  /**
   * Internal recovery routine called on startup corruption or mid-session
   * SQLITE_CORRUPT errors.  Closes the current connection, checks whether the
   * DB file is still corrupt, quarantines it if so, opens a fresh database,
   * re-enqueues orphan screenshots, and fires the onRecovery callback.
   * Returns true on success; false if recovery itself fails.
   */
  const recover = (reason) => {
    if (recovering) return false
    recovering = true
    try {
      logger.error('stills.db corruption detected, attempting recovery', { dbPath, reason })
      try { if (db) db.close() } catch (_) {}
      db = null

      const quarantinePath = checkAndMaybeQuarantine()

      initDb()

      if (quarantinePath !== null) {
        const requeuedCount = enqueueOrphans()
        logger.log('stills.db recovery complete', { quarantinePath, requeuedCount })
        if (typeof onRecovery === 'function') {
          try { onRecovery({ dbPath, quarantinePath, requeuedCount }) } catch (_) {}
        }
      } else {
        // DB was already healthy — another connection recovered it; just reconnected
        logger.log('stills.db reconnected after corruption (DB already healthy)', { dbPath })
      }
      return true
    } catch (err) {
      logger.error('stills.db recovery failed', { error: err?.message || String(err) })
      return false
    } finally {
      recovering = false
    }
  }

  /**
   * Execute fn(), catch SQLITE_CORRUPT, attempt one recovery, then retry.
   * If recovery itself fails the original error is re-thrown.
   */
  const withCorruptionRetry = (fn) => {
    try {
      return fn()
    } catch (err) {
      if (!isCorruptionError(err)) throw err
      if (!recover('runtime-operation')) throw err
      return fn()
    }
  }

  // --- Startup: open and run integrity check before any schema work ---
  // Both new Database() and the integrity pragma can throw SQLITE_NOTADB /
  // SQLITE_CORRUPT when the file is malformed, so wrap them together.

  let startupCorrupt = false
  try {
    openDb()
    const result = db.pragma('integrity_check')
    const ok = Array.isArray(result) && result.length === 1 && result[0]?.integrity_check === 'ok'
    if (!ok) startupCorrupt = true
  } catch (err) {
    if (isCorruptionError(err)) {
      // Close the partially-opened handle if one exists
      try { if (db) db.close() } catch (_) {}
      db = null
      startupCorrupt = true
    } else {
      throw err
    }
  }

  if (startupCorrupt) {
    // recover() closes db (handling null safely), quarantines, re-opens,
    // scans orphans, fires callback
    recover('startup-integrity-check')
  } else {
    initSchema()
    prepareStatements()
  }

  logger.log('Stills queue initialized', { dbPath })

  // --- Public API ---

  const enqueueCapture = ({
    imagePath,
    sessionId,
    capturedAt,
    provider,
    model,
    appName,
    appBundleId,
    appTitle,
    appLabelSource,
    visibleWindowNames
  } = {}) => {
    if (!imagePath) {
      throw new Error('imagePath is required to enqueue still capture.')
    }
    if (!sessionId) {
      throw new Error('sessionId is required to enqueue still capture.')
    }
    if (!capturedAt) {
      throw new Error('capturedAt is required to enqueue still capture.')
    }

    return withCorruptionRetry(() => {
      const now = new Date().toISOString()
      const info = stmts.insert.run(
        imagePath,
        sessionId,
        capturedAt,
        STATUS.PENDING,
        provider || null,
        model || null,
        null,
        null,
        appName || null,
        appBundleId || null,
        appTitle || null,
        appLabelSource || null,
        normalizeVisibleWindowNames(visibleWindowNames),
        now,
        now
      )

      if (info.changes > 0) {
        logger.log('Enqueued still capture', { imagePath, sessionId, capturedAt })
      }

      return info.changes > 0
    })
  }

  const getPendingBatch = (limit = 30) => {
    const resolvedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30
    return withCorruptionRetry(() => stmts.pending.all(STATUS.PENDING, resolvedLimit))
  }

  const markProcessing = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      return 0
    }
    return withCorruptionRetry(() => {
      const placeholders = ids.map(() => '?').join(', ')
      const stmt = db.prepare(`
        UPDATE stills_queue
        SET status = ?, updated_at = ?
        WHERE status = ? AND id IN (${placeholders})
      `)
      const now = new Date().toISOString()
      return stmt.run(STATUS.PROCESSING, now, STATUS.PENDING, ...ids).changes
    })
  }

  const markDone = ({ id, markdownPath, provider, model } = {}) => {
    if (!id) {
      throw new Error('id is required to mark still as done.')
    }
    if (!markdownPath) {
      throw new Error('markdownPath is required to mark still as done.')
    }
    return withCorruptionRetry(() => {
      const now = new Date().toISOString()
      return stmts.updateDone.run(
        STATUS.DONE,
        markdownPath,
        provider || null,
        model || null,
        now,
        id
      ).changes
    })
  }

  const markFailed = ({ id, error } = {}) => {
    if (!id) {
      throw new Error('id is required to mark still as failed.')
    }
    return withCorruptionRetry(() => {
      const now = new Date().toISOString()
      const message = error ? String(error) : 'unknown error'
      return stmts.updateFailed.run(STATUS.FAILED, message, now, id).changes
    })
  }

  const markPending = ({ id, error } = {}) => {
    if (!id) {
      throw new Error('id is required to requeue a still.')
    }
    return withCorruptionRetry(() => {
      const now = new Date().toISOString()
      const message = error ? String(error) : null
      return stmts.updatePendingWithError.run(STATUS.PENDING, message, now, id).changes
    })
  }

  const requeueStaleProcessing = ({ olderThanMs } = {}) => {
    const resolvedOlderThanMs = Number.isFinite(olderThanMs) && olderThanMs > 0
      ? Math.floor(olderThanMs)
      : 0
    if (!resolvedOlderThanMs) {
      return 0
    }
    return withCorruptionRetry(() => {
      const cutoff = new Date(Date.now() - resolvedOlderThanMs).toISOString()
      const now = new Date().toISOString()
      return stmts.updateStaleProcessing.run(
        STATUS.PENDING,
        now,
        STATUS.PROCESSING,
        cutoff
      ).changes
    })
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
    markPending,
    requeueStaleProcessing,
    close
  }
}

module.exports = {
  STATUS,
  resolveDbPath,
  isCorruptionError,
  createStillsQueue
}
