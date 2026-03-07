const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DB_FILENAME
} = require('../const')
const {
  safeFsPath,
  toSafeString
} = require('./utils')

const HEARTBEAT_HISTORY_STATUS = Object.freeze({
  COMPLETED: 'completed',
  FAILED: 'failed'
})

const resolveHeartbeatDbPath = (contextFolderPath) => {
  const safeContextFolderPath = safeFsPath(contextFolderPath)
  if (!safeContextFolderPath) {
    throw new Error('Context folder path is required for heartbeat history.')
  }

  return path.join(safeContextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DB_FILENAME)
}

const createHeartbeatHistoryStore = ({
  contextFolderPath,
  databaseFactory = (dbPath) => new Database(dbPath),
  logger = console
} = {}) => {
  const dbPath = resolveHeartbeatDbPath(contextFolderPath)
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const db = databaseFactory(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS heartbeats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      heartbeat_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      runner TEXT NOT NULL,
      scheduled_at_utc TEXT NOT NULL,
      started_at_utc TEXT NOT NULL,
      completed_at_utc TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
      seen_at_utc TEXT,
      output_path TEXT,
      error_message TEXT
    );
  `)
  const tableInfo = db.prepare('PRAGMA table_info(heartbeats)').all()
  const existingColumns = Array.isArray(tableInfo)
    ? tableInfo.map((row) => row?.name).filter(Boolean)
    : []
  if (!existingColumns.includes('seen_at_utc')) {
    db.exec('ALTER TABLE heartbeats ADD COLUMN seen_at_utc TEXT')
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_heartbeats_completed_at
      ON heartbeats (completed_at_utc DESC);
    CREATE INDEX IF NOT EXISTS idx_heartbeats_seen_completed
      ON heartbeats (seen_at_utc, completed_at_utc DESC);
  `)

  const insertHeartbeatStmt = db.prepare(`
    INSERT INTO heartbeats (
      heartbeat_id,
      topic,
      runner,
      scheduled_at_utc,
      started_at_utc,
      completed_at_utc,
      status,
      seen_at_utc,
      output_path,
      error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const selectRecentHeartbeatsStmt = db.prepare(`
    SELECT
      id,
      heartbeat_id AS heartbeatId,
      topic,
      runner,
      scheduled_at_utc AS scheduledAtUtc,
      started_at_utc AS startedAtUtc,
      completed_at_utc AS completedAtUtc,
      status,
      seen_at_utc AS seenAtUtc,
      output_path AS outputPath,
      error_message AS errorMessage
    FROM heartbeats
    ORDER BY completed_at_utc DESC, id DESC
    LIMIT ?
  `)

  const selectUnreadHeartbeatCountStmt = db.prepare(`
    SELECT COUNT(*) AS unreadCount
    FROM heartbeats
    WHERE seen_at_utc IS NULL
  `)

  const markAllHeartbeatsSeenStmt = db.prepare(`
    UPDATE heartbeats
    SET seen_at_utc = ?
    WHERE seen_at_utc IS NULL
  `)

  const recordHeartbeatRun = ({
    heartbeatId,
    topic,
    runner,
    scheduledAtUtc,
    startedAtUtc,
    completedAtUtc,
    status,
    seenAtUtc = null,
    outputPath = null,
    errorMessage = null
  } = {}) => {
    const safeHeartbeatId = toSafeString(heartbeatId)
    const safeTopic = toSafeString(topic)
    const safeRunner = toSafeString(runner)
    const safeScheduledAtUtc = toSafeString(scheduledAtUtc)
    const safeStartedAtUtc = toSafeString(startedAtUtc)
    const safeCompletedAtUtc = toSafeString(completedAtUtc)
    const safeStatus = toSafeString(status)

    if (!safeHeartbeatId) {
      throw new Error('heartbeatId is required to record heartbeat history.')
    }
    if (!safeTopic) {
      throw new Error('topic is required to record heartbeat history.')
    }
    if (!safeRunner) {
      throw new Error('runner is required to record heartbeat history.')
    }
    if (!safeScheduledAtUtc || !safeStartedAtUtc || !safeCompletedAtUtc) {
      throw new Error('UTC timestamps are required to record heartbeat history.')
    }
    if (!Object.values(HEARTBEAT_HISTORY_STATUS).includes(safeStatus)) {
      throw new Error('status must be a supported heartbeat history status.')
    }

    const info = insertHeartbeatStmt.run(
      safeHeartbeatId,
      safeTopic,
      safeRunner,
      safeScheduledAtUtc,
      safeStartedAtUtc,
      safeCompletedAtUtc,
      safeStatus,
      toSafeString(seenAtUtc) || null,
      toSafeString(outputPath) || null,
      toSafeString(errorMessage) || null
    )

    logger.log('Heartbeat history recorded', {
      heartbeatId: safeHeartbeatId,
      topic: safeTopic,
      status: safeStatus,
      rowId: info.lastInsertRowid
    })

    return Number(info.lastInsertRowid)
  }

  const getRecentHeartbeats = ({ limit = 5 } = {}) => {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5
    return selectRecentHeartbeatsStmt.all(safeLimit)
  }

  const hasUnreadHeartbeats = () => {
    const row = selectUnreadHeartbeatCountStmt.get()
    return Number(row?.unreadCount) > 0
  }

  const markAllHeartbeatsSeen = ({ seenAtUtc = new Date().toISOString() } = {}) => {
    const safeSeenAtUtc = toSafeString(seenAtUtc)
    if (!safeSeenAtUtc) {
      throw new Error('seenAtUtc is required to mark heartbeats as seen.')
    }

    const info = markAllHeartbeatsSeenStmt.run(safeSeenAtUtc)
    const changes = Number(info?.changes) || 0
    if (changes > 0) {
      logger.log('Marked heartbeat runs as seen', {
        seenAtUtc: safeSeenAtUtc,
        changes
      })
    }
    return changes
  }

  const close = () => {
    db.close()
  }

  return {
    dbPath,
    recordHeartbeatRun,
    getRecentHeartbeats,
    hasUnreadHeartbeats,
    markAllHeartbeatsSeen,
    close
  }
}

module.exports = {
  HEARTBEAT_HISTORY_STATUS,
  createHeartbeatHistoryStore,
  resolveHeartbeatDbPath
}
