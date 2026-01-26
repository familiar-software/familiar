const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const Database = require('better-sqlite3')

const { JIMINY_BEHIND_THE_SCENES_DIR_NAME } = require('../const')
const { ensureHistorySchema } = require('./schema')

const DB_FILENAME = 'history.sqlite'
const dbCache = new Map()

const resolveHistoryDbPath = (contextFolderPath) => {
  if (typeof contextFolderPath !== 'string' || contextFolderPath.trim().length === 0) {
    return null
  }

  const resolvedContextPath = path.resolve(contextFolderPath)
  return path.join(resolvedContextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, DB_FILENAME)
}

const getHistoryDb = (contextFolderPath) => {
  const dbPath = resolveHistoryDbPath(contextFolderPath)
  if (!dbPath) {
    console.warn('History DB not initialized because context folder path is missing')
    return null
  }

  if (dbCache.has(dbPath)) {
    return dbCache.get(dbPath)
  }

  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    ensureHistorySchema(db)
    dbCache.set(dbPath, db)
    console.info('History DB initialized', { dbPath })
    return db
  } catch (error) {
    console.error('Failed to initialize history DB', { dbPath, error })
    return null
  }
}

const serializeMetadata = (metadata) => {
  if (metadata == null) {
    return null
  }
  if (typeof metadata === 'string') {
    return metadata
  }

  try {
    return JSON.stringify(metadata)
  } catch (error) {
    console.warn('Failed to serialize history metadata', { error })
    return null
  }
}

const createFlow = ({ contextFolderPath, id, trigger, summary, status } = {}) => {
  const db = getHistoryDb(contextFolderPath)
  if (!db) {
    return null
  }

  const flowId = typeof id === 'string' && id.trim().length > 0 ? id : randomUUID()
  const now = Date.now()
  const flowStatus = typeof status === 'string' && status.trim().length > 0 ? status : 'in_progress'
  const flowTrigger = typeof trigger === 'string' && trigger.trim().length > 0 ? trigger : 'unknown'
  const flowSummary = typeof summary === 'string' && summary.trim().length > 0 ? summary : null

  try {
    db.prepare(`
      INSERT INTO history_flows (
        id,
        created_at,
        updated_at,
        trigger,
        status,
        summary,
        last_event_id,
        context_folder_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      flowId,
      now,
      now,
      flowTrigger,
      flowStatus,
      flowSummary,
      null,
      contextFolderPath || null
    )
    return flowId
  } catch (error) {
    console.error('Failed to create history flow', { flowId, error })
    return null
  }
}

const getFlowById = (db, flowId) => {
  return db.prepare('SELECT * FROM history_flows WHERE id = ?').get(flowId)
}

const deriveFlowStatus = (events) => {
  if (!events || events.length === 0) {
    return 'in_progress'
  }

  const lastStatus = events[events.length - 1].status
  const hasSuccess = events.some((event) => event.status === 'success')
  const hasFailed = events.some((event) => event.status === 'failed')
  const hasSkipped = events.some((event) => event.status === 'skipped')

  if (lastStatus === 'started') {
    return 'in_progress'
  }

  if (hasFailed) {
    return hasSuccess ? 'partial' : 'failed'
  }

  if (hasSkipped) {
    return hasSuccess ? 'partial' : 'skipped'
  }

  if (hasSuccess) {
    return 'success'
  }

  return 'in_progress'
}

const recordEvent = ({
  contextFolderPath,
  flowId,
  trigger,
  step,
  status,
  summary,
  detail,
  sourcePath,
  outputPath,
  errorCode,
  errorMessage,
  metadata
} = {}) => {
  const db = getHistoryDb(contextFolderPath)
  if (!db) {
    return null
  }

  const resolvedFlowId = typeof flowId === 'string' && flowId.trim().length > 0
    ? flowId
    : randomUUID()

  const eventId = randomUUID()
  const createdAt = Date.now()
  const eventStep = typeof step === 'string' && step.trim().length > 0 ? step : 'unknown'
  const eventStatus = typeof status === 'string' && status.trim().length > 0 ? status : 'started'
  const eventSummary = typeof summary === 'string' && summary.trim().length > 0 ? summary : null
  const eventDetail = typeof detail === 'string' && detail.trim().length > 0 ? detail : null
  const eventSourcePath = typeof sourcePath === 'string' && sourcePath.trim().length > 0 ? sourcePath : null
  const eventOutputPath = typeof outputPath === 'string' && outputPath.trim().length > 0 ? outputPath : null
  const eventErrorCode = typeof errorCode === 'string' && errorCode.trim().length > 0 ? errorCode : null
  const eventErrorMessage = typeof errorMessage === 'string' && errorMessage.trim().length > 0 ? errorMessage : null
  const eventMetadata = serializeMetadata(metadata)

  try {
    let flow = getFlowById(db, resolvedFlowId)
    if (!flow) {
      const createdFlowId = createFlow({
        contextFolderPath,
        id: resolvedFlowId,
        trigger,
        summary: eventSummary,
        status: 'in_progress'
      })
      if (!createdFlowId) {
        return null
      }
      flow = getFlowById(db, resolvedFlowId)
    }

    db.prepare(`
      INSERT INTO history_events (
        id,
        flow_id,
        created_at,
        step,
        status,
        summary,
        detail,
        source_path,
        output_path,
        error_code,
        error_message,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      resolvedFlowId,
      createdAt,
      eventStep,
      eventStatus,
      eventSummary,
      eventDetail,
      eventSourcePath,
      eventOutputPath,
      eventErrorCode,
      eventErrorMessage,
      eventMetadata
    )

    const events = db.prepare(
      'SELECT status FROM history_events WHERE flow_id = ? ORDER BY created_at ASC'
    ).all(resolvedFlowId)
    const nextStatus = deriveFlowStatus(events)
    const nextSummary = flow.summary || eventSummary

    db.prepare(`
      UPDATE history_flows
      SET updated_at = ?, status = ?, last_event_id = ?, summary = ?
      WHERE id = ?
    `).run(createdAt, nextStatus, eventId, nextSummary, resolvedFlowId)

    return { flowId: resolvedFlowId, eventId, status: nextStatus }
  } catch (error) {
    console.error('Failed to record history event', { flowId: resolvedFlowId, error })
    return null
  }
}

const listFlows = ({ contextFolderPath, limit = 50, offset = 0 } = {}) => {
  const db = getHistoryDb(contextFolderPath)
  if (!db) {
    return []
  }

  try {
    return db.prepare(`
      SELECT *
      FROM history_flows
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset)
  } catch (error) {
    console.error('Failed to list history flows', { error })
    return []
  }
}

const listEvents = ({ contextFolderPath, flowId } = {}) => {
  const db = getHistoryDb(contextFolderPath)
  if (!db) {
    return []
  }

  if (typeof flowId !== 'string' || flowId.trim().length === 0) {
    return []
  }

  try {
    return db.prepare(`
      SELECT *
      FROM history_events
      WHERE flow_id = ?
      ORDER BY created_at ASC
    `).all(flowId)
  } catch (error) {
    console.error('Failed to list history events', { flowId, error })
    return []
  }
}

const resolveHistoryExportPath = (contextFolderPath, flowId) => {
  if (typeof contextFolderPath !== 'string' || contextFolderPath.trim().length === 0) {
    return null
  }
  if (typeof flowId !== 'string' || flowId.trim().length === 0) {
    return null
  }

  const resolvedContextPath = path.resolve(contextFolderPath)
  return path.join(
    resolvedContextPath,
    JIMINY_BEHIND_THE_SCENES_DIR_NAME,
    'history-exports',
    `${flowId}.json`
  )
}

const exportFlowEvents = ({ contextFolderPath, flowId } = {}) => {
  if (typeof flowId !== 'string' || flowId.trim().length === 0) {
    return { ok: false, message: 'Missing flow id.' }
  }

  const db = getHistoryDb(contextFolderPath)
  if (!db) {
    return { ok: false, message: 'History DB unavailable.' }
  }

  let events = []
  try {
    events = db.prepare(`
      SELECT *
      FROM history_events
      WHERE flow_id = ?
      ORDER BY created_at ASC
    `).all(flowId)
  } catch (error) {
    console.error('Failed to load history events for export', { flowId, error })
    return { ok: false, message: 'Failed to load history events.' }
  }

  const exportPath = resolveHistoryExportPath(contextFolderPath, flowId)
  if (!exportPath) {
    return { ok: false, message: 'Unable to resolve export path.' }
  }

  try {
    fs.mkdirSync(path.dirname(exportPath), { recursive: true })
    const payload = { flow_id: flowId, events }
    fs.writeFileSync(exportPath, JSON.stringify(payload, null, 2), 'utf8')
    console.info('History export created', { flowId, exportPath, events: events.length })
    return { ok: true, path: exportPath, eventsCount: events.length }
  } catch (error) {
    console.error('Failed to write history export', { flowId, exportPath, error })
    return { ok: false, message: 'Failed to write history export.' }
  }
}

const getRecentFlows = ({ contextFolderPath, limit = 3 } = {}) => {
  return listFlows({ contextFolderPath, limit })
}

module.exports = {
  createFlow,
  recordEvent,
  listFlows,
  listEvents,
  exportFlowEvents,
  getRecentFlows,
  resolveHistoryDbPath,
  resolveHistoryExportPath
}
