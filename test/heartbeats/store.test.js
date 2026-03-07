const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  HEARTBEAT_HISTORY_STATUS,
  createHeartbeatHistoryStore
} = require('../../src/heartbeats/store')

class FakeDatabase {
  constructor() {
    this.rows = []
    this.nextId = 1
    this.execCalls = []
    this.columns = [
      { name: 'id' },
      { name: 'heartbeat_id' },
      { name: 'topic' },
      { name: 'runner' },
      { name: 'scheduled_at_utc' },
      { name: 'started_at_utc' },
      { name: 'completed_at_utc' },
      { name: 'status' },
      { name: 'output_path' },
      { name: 'error_message' }
    ]
  }

  pragma() {}

  exec(sql) {
    this.execCalls.push(sql)
    if (typeof sql === 'string' && sql.includes('ADD COLUMN seen_at_utc')) {
      this.columns.push({ name: 'seen_at_utc' })
    }
    if (typeof sql === 'string' && sql.includes('ADD COLUMN attempt_number')) {
      this.columns.push({ name: 'attempt_number' })
    }
    if (typeof sql === 'string' && sql.includes('ADD COLUMN next_retry_at_utc')) {
      this.columns.push({ name: 'next_retry_at_utc' })
    }
  }

  prepare(sql) {
    if (sql.includes('PRAGMA table_info(heartbeats)')) {
      return {
        all: () => this.columns.slice()
      }
    }

    if (sql.includes('INSERT INTO heartbeats')) {
      return {
        run: (
          heartbeatId,
          topic,
          runner,
          scheduledAtUtc,
          startedAtUtc,
          completedAtUtc,
          status,
          seenAtUtc,
          outputPath,
          errorMessage,
          attemptNumber,
          nextRetryAtUtc
        ) => {
          const row = {
            id: this.nextId,
            heartbeatId,
            topic,
            runner,
            scheduledAtUtc,
            startedAtUtc,
            completedAtUtc,
            status,
            seenAtUtc,
            outputPath,
            errorMessage,
            attemptNumber,
            nextRetryAtUtc
          }
          this.rows.push(row)
          this.nextId += 1
          return { lastInsertRowid: row.id }
        }
      }
    }

    if (sql.includes('ORDER BY scheduled_at_utc DESC, attempt_number DESC, id DESC')) {
      return {
        get: (heartbeatId) => this.rows
          .filter((row) => row.heartbeatId === heartbeatId)
          .sort((left, right) => {
            if (left.scheduledAtUtc === right.scheduledAtUtc) {
              if ((left.attemptNumber || 1) === (right.attemptNumber || 1)) {
                return right.id - left.id
              }
              return (right.attemptNumber || 1) - (left.attemptNumber || 1)
            }
            return left.scheduledAtUtc < right.scheduledAtUtc ? 1 : -1
          })[0] || undefined
      }
    }

    if (sql.includes('COUNT(*) AS unreadCount')) {
      return {
        get: () => ({
          unreadCount: this.rows.filter((row) => !row.seenAtUtc).length
        })
      }
    }

    if (sql.includes('SET seen_at_utc = ?')) {
      return {
        run: (seenAtUtc) => {
          let changes = 0
          this.rows.forEach((row) => {
            if (!row.seenAtUtc) {
              row.seenAtUtc = seenAtUtc
              changes += 1
            }
          })
          return { changes }
        }
      }
    }

    if (sql.includes('FROM heartbeats')) {
      return {
        all: (limit) => this.rows
          .slice()
          .sort((left, right) => {
            if (left.completedAtUtc === right.completedAtUtc) {
              return right.id - left.id
            }
            return left.completedAtUtc < right.completedAtUtc ? 1 : -1
          })
          .slice(0, limit)
      }
    }

    throw new Error(`Unexpected SQL in test: ${sql}`)
  }

  close() {}
}

test('heartbeat history store records and returns recent runs in descending completion order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-history-'))
  const store = createHeartbeatHistoryStore({
    contextFolderPath: root,
    databaseFactory: () => new FakeDatabase()
  })

  store.recordHeartbeatRun({
    heartbeatId: 'hb-1',
    topic: 'daily-summary',
    runner: 'codex',
    scheduledAtUtc: '2026-03-05T08:00:00.000Z',
    startedAtUtc: '2026-03-05T08:00:10.000Z',
    completedAtUtc: '2026-03-05T08:01:00.000Z',
    status: HEARTBEAT_HISTORY_STATUS.COMPLETED,
    outputPath: '/tmp/daily-summary.md'
  })
  store.recordHeartbeatRun({
    heartbeatId: 'hb-2',
    topic: 'retro',
    runner: 'claude-code',
    scheduledAtUtc: '2026-03-06T08:00:00.000Z',
    startedAtUtc: '2026-03-06T08:00:03.000Z',
    completedAtUtc: '2026-03-06T08:00:45.000Z',
    status: HEARTBEAT_HISTORY_STATUS.FAILED,
    errorMessage: 'Runner unavailable'
  })

  const rows = store.getRecentHeartbeats({ limit: 5 })

  assert.equal(rows.length, 2)
  assert.equal(rows[0].heartbeatId, 'hb-2')
  assert.equal(rows[0].status, HEARTBEAT_HISTORY_STATUS.FAILED)
  assert.equal(rows[0].errorMessage, 'Runner unavailable')
  assert.equal(rows[0].seenAtUtc, null)
  assert.equal(rows[1].heartbeatId, 'hb-1')
  assert.equal(rows[1].outputPath, '/tmp/daily-summary.md')

  store.close()
  fs.rmSync(root, { recursive: true, force: true })
})

test('heartbeat history store adds seen_at_utc before creating unread index on older schemas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-history-'))
  const fakeDb = new FakeDatabase()

  createHeartbeatHistoryStore({
    contextFolderPath: root,
    databaseFactory: () => fakeDb
  }).close()

  const alterIndex = fakeDb.execCalls.findIndex((sql) => sql.includes('ALTER TABLE heartbeats ADD COLUMN seen_at_utc TEXT'))
  const attemptIndex = fakeDb.execCalls.findIndex((sql) => sql.includes('ALTER TABLE heartbeats ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1'))
  const retryColumnIndex = fakeDb.execCalls.findIndex((sql) => sql.includes('ALTER TABLE heartbeats ADD COLUMN next_retry_at_utc TEXT'))
  const unreadIndex = fakeDb.execCalls.findIndex((sql) => sql.includes('idx_heartbeats_seen_completed'))
  const retryLookupIndex = fakeDb.execCalls.findIndex((sql) => sql.includes('idx_heartbeats_retry_lookup'))

  assert.notEqual(alterIndex, -1)
  assert.notEqual(attemptIndex, -1)
  assert.notEqual(retryColumnIndex, -1)
  assert.notEqual(unreadIndex, -1)
  assert.notEqual(retryLookupIndex, -1)
  assert.ok(alterIndex < unreadIndex)
  assert.ok(attemptIndex < retryLookupIndex)
  assert.ok(retryColumnIndex < retryLookupIndex)

  fs.rmSync(root, { recursive: true, force: true })
})

test('heartbeat history store reports unread rows and marks them seen', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-history-'))
  const store = createHeartbeatHistoryStore({
    contextFolderPath: root,
    databaseFactory: () => new FakeDatabase()
  })

  store.recordHeartbeatRun({
    heartbeatId: 'hb-1',
    topic: 'daily-summary',
    runner: 'codex',
    scheduledAtUtc: '2026-03-05T08:00:00.000Z',
    startedAtUtc: '2026-03-05T08:00:10.000Z',
    completedAtUtc: '2026-03-05T08:01:00.000Z',
    status: HEARTBEAT_HISTORY_STATUS.COMPLETED
  })

  assert.equal(store.hasUnreadHeartbeats(), true)
  assert.equal(
    store.markAllHeartbeatsSeen({ seenAtUtc: '2026-03-05T09:00:00.000Z' }),
    1
  )
  assert.equal(store.hasUnreadHeartbeats(), false)
  assert.equal(store.getRecentHeartbeats({ limit: 1 })[0].seenAtUtc, '2026-03-05T09:00:00.000Z')

  store.close()
  fs.rmSync(root, { recursive: true, force: true })
})

test('heartbeat history store returns the latest due retry for a heartbeat', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-history-'))
  const store = createHeartbeatHistoryStore({
    contextFolderPath: root,
    databaseFactory: () => new FakeDatabase()
  })

  store.recordHeartbeatRun({
    heartbeatId: 'hb-1',
    topic: 'daily-summary',
    runner: 'codex',
    scheduledAtUtc: '2026-03-05T08:00:00.000Z',
    startedAtUtc: '2026-03-05T08:00:10.000Z',
    completedAtUtc: '2026-03-05T08:01:00.000Z',
    status: HEARTBEAT_HISTORY_STATUS.FAILED,
    attemptNumber: 1,
    nextRetryAtUtc: '2026-03-05T08:02:00.000Z'
  })
  store.recordHeartbeatRun({
    heartbeatId: 'hb-1',
    topic: 'daily-summary',
    runner: 'codex',
    scheduledAtUtc: '2026-03-04T08:00:00.000Z',
    startedAtUtc: '2026-03-04T08:00:10.000Z',
    completedAtUtc: '2026-03-04T08:01:00.000Z',
    status: HEARTBEAT_HISTORY_STATUS.FAILED,
    attemptNumber: 1,
    nextRetryAtUtc: '2026-03-04T08:02:00.000Z'
  })
  store.recordHeartbeatRun({
    heartbeatId: 'hb-2',
    topic: 'retro',
    runner: 'claude-code',
    scheduledAtUtc: '2026-03-05T08:00:00.000Z',
    startedAtUtc: '2026-03-05T08:00:10.000Z',
    completedAtUtc: '2026-03-05T08:01:00.000Z',
    status: HEARTBEAT_HISTORY_STATUS.FAILED,
    attemptNumber: 1,
    nextRetryAtUtc: '2026-03-05T08:02:00.000Z'
  })

  const retry = store.getLatestPendingRetry({
    heartbeatId: 'hb-1',
    nowUtc: '2026-03-05T08:03:00.000Z'
  })

  assert.equal(retry?.heartbeatId, 'hb-1')
  assert.equal(retry?.scheduledAtUtc, '2026-03-05T08:00:00.000Z')
  assert.equal(retry?.attemptNumber, 1)
  assert.equal(retry?.nextRetryAtUtc, '2026-03-05T08:02:00.000Z')

  store.close()
  fs.rmSync(root, { recursive: true, force: true })
})

test('heartbeat history store rejects unsupported statuses', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-history-'))
  const store = createHeartbeatHistoryStore({
    contextFolderPath: root,
    databaseFactory: () => new FakeDatabase()
  })

  assert.throws(
    () => store.recordHeartbeatRun({
      heartbeatId: 'hb-1',
      topic: 'daily-summary',
      runner: 'codex',
      scheduledAtUtc: '2026-03-05T08:00:00.000Z',
      startedAtUtc: '2026-03-05T08:00:10.000Z',
      completedAtUtc: '2026-03-05T08:01:00.000Z',
      status: 'ok'
    }),
    /status must be a supported heartbeat history status/
  )

  store.close()
  fs.rmSync(root, { recursive: true, force: true })
})
