const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  parseSessionTimestampMs,
  resolveCleanupRetentionDays,
  shouldRunDailyCleanup,
  resolveAutoCleanupRoots,
  cleanupSessionDirectoriesByRetention,
  createAutoSessionCleanupScheduler,
  runAutoSessionCleanup
} = require('../src/storage/auto-session-cleanup')

const createSessionId = (date) => {
  const iso = date.toISOString().replace(/[:.]/g, '-')
  return `session-${iso}`
}

const createTestLogger = () => {
  const entries = []
  return {
    entries,
    log: (message, payload) => entries.push({ level: 'log', message, payload }),
    warn: (message, payload) => entries.push({ level: 'warn', message, payload }),
    error: (message, payload) => entries.push({ level: 'error', message, payload })
  }
}

test('parseSessionTimestampMs parses strict session ids', () => {
  const parsed = parseSessionTimestampMs('session-2026-02-17T12-30-45-123Z')
  assert.equal(parsed, Date.parse('2026-02-17T12:30:45.123Z'))
  assert.equal(parseSessionTimestampMs('session-2026-02-17T12:30:45.123Z'), null)
})

test('resolveCleanupRetentionDays falls back to 2 for invalid values', () => {
  const logger = createTestLogger()
  assert.equal(resolveCleanupRetentionDays(2, logger), 2)
  assert.equal(resolveCleanupRetentionDays(7, logger), 7)
  assert.equal(resolveCleanupRetentionDays(3, logger), 2)
  assert.ok(logger.entries.some((entry) => entry.level === 'warn'))
})

test('shouldRunDailyCleanup enforces 24h gate', () => {
  const nowMs = Date.parse('2026-02-20T12:00:00.000Z')
  assert.equal(shouldRunDailyCleanup(null, nowMs), true)
  assert.equal(shouldRunDailyCleanup(nowMs - 24 * 60 * 60 * 1000, nowMs), true)
  assert.equal(shouldRunDailyCleanup(nowMs - 24 * 60 * 60 * 1000 + 1, nowMs), false)
})

test('resolveAutoCleanupRoots includes stills root only', () => {
  const roots = resolveAutoCleanupRoots('/tmp/context')
  assert.equal(roots.length, 1)
  assert.equal(roots[0], path.join('/tmp/context', 'familiar', 'stills'))
})

test('cleanupSessionDirectoriesByRetention deletes only old session folders with guardrails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-auto-cleanup-'))
  const contextPath = path.join(root, 'context')
  const stillsRoot = path.join(contextPath, 'familiar', 'stills')
  const markdownRoot = path.join(contextPath, 'familiar', 'stills-markdown')
  fs.mkdirSync(stillsRoot, { recursive: true })
  fs.mkdirSync(markdownRoot, { recursive: true })

  const nowMs = Date.parse('2026-02-20T12:00:00.000Z')
  const oldSessionDir = path.join(stillsRoot, createSessionId(new Date(nowMs - 8 * 24 * 60 * 60 * 1000)))
  const boundarySessionDir = path.join(
    stillsRoot,
    createSessionId(new Date(nowMs - 7 * 24 * 60 * 60 * 1000))
  )
  const futureSessionDir = path.join(markdownRoot, createSessionId(new Date(nowMs + 60 * 1000)))
  const invalidSessionDir = path.join(markdownRoot, 'session-invalid')
  const regularFolder = path.join(markdownRoot, 'notes')
  const outsideRoot = path.join(root, 'outside')
  const outsideSessionDir = path.join(
    outsideRoot,
    createSessionId(new Date(nowMs - 8 * 24 * 60 * 60 * 1000))
  )
  fs.mkdirSync(oldSessionDir, { recursive: true })
  fs.mkdirSync(boundarySessionDir, { recursive: true })
  fs.mkdirSync(futureSessionDir, { recursive: true })
  fs.mkdirSync(invalidSessionDir, { recursive: true })
  fs.mkdirSync(regularFolder, { recursive: true })
  fs.mkdirSync(outsideSessionDir, { recursive: true })

  const symlinkSessionPath = path.join(stillsRoot, 'session-2026-02-01T00-00-00-000Z')
  fs.symlinkSync(outsideSessionDir, symlinkSessionPath)

  const logger = createTestLogger()
  const deleted = []
  const summary = await cleanupSessionDirectoriesByRetention([stillsRoot, markdownRoot, outsideRoot], {
    retentionDays: 7,
    nowMs,
    allowedRoots: [stillsRoot, markdownRoot],
    logger,
    deleteDirectory: async (targetPath) => {
      deleted.push(targetPath)
      fs.rmSync(targetPath, { recursive: true, force: false })
    }
  })

  assert.equal(summary.deletedSessionCount, 1)
  assert.equal(summary.failedSessionCount, 0)
  assert.equal(summary.scannedSessionCount, 3)
  assert.equal(summary.skippedInvalidNameCount, 2)
  assert.equal(summary.skippedFutureDatedCount, 1)
  assert.equal(fs.existsSync(oldSessionDir), false)
  assert.equal(fs.existsSync(boundarySessionDir), true)
  assert.equal(fs.existsSync(futureSessionDir), true)
  assert.equal(fs.existsSync(invalidSessionDir), true)
  assert.equal(fs.existsSync(regularFolder), true)
  assert.equal(fs.existsSync(outsideSessionDir), true)
  assert.equal(deleted.length, 1)
  assert.ok(logger.entries.some((entry) => entry.message.includes('outside allowed roots')))
  fs.rmSync(root, { recursive: true, force: true })
})

test('cleanupSessionDirectoriesByRetention refuses deletes when allowedRoots are empty', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-auto-cleanup-empty-roots-'))
  const stillsRoot = path.join(root, 'familiar', 'stills')
  fs.mkdirSync(stillsRoot, { recursive: true })
  const sessionDir = path.join(stillsRoot, 'session-2026-02-01T00-00-00-000Z')
  fs.mkdirSync(sessionDir, { recursive: true })

  const summary = await cleanupSessionDirectoriesByRetention([stillsRoot], {
    nowMs: Date.parse('2026-02-20T00:00:00.000Z'),
    allowedRoots: [],
    deleteDirectory: async () => {
      throw new Error('should not be called')
    }
  })

  assert.equal(summary.deletedSessionCount, 0)
  assert.equal(fs.existsSync(sessionDir), true)
  fs.rmSync(root, { recursive: true, force: true })
})

test('cleanupSessionDirectoriesByRetention passes normalized allowedRoots to deleteDirectoryIfAllowedFn', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-auto-cleanup-pass-roots-'))
  const stillsRoot = path.join(root, 'context', 'familiar', 'stills')
  fs.mkdirSync(stillsRoot, { recursive: true })
  const oldSessionDir = path.join(stillsRoot, 'session-2026-02-01T00-00-00-000Z')
  fs.mkdirSync(oldSessionDir, { recursive: true })

  const rawAllowedRoots = [path.join(stillsRoot, '..', 'stills')]
  const calls = []
  const summary = await cleanupSessionDirectoriesByRetention([stillsRoot], {
    nowMs: Date.parse('2026-02-20T00:00:00.000Z'),
    allowedRoots: rawAllowedRoots,
    deleteDirectoryIfAllowedFn: async (dirPath, options = {}) => {
      calls.push({ dirPath, allowedRoots: options.allowedRoots || [] })
      return { ok: true, path: dirPath }
    },
    deleteDirectory: async () => {},
    logger: createTestLogger()
  })

  const realStillsRoot = fs.realpathSync(stillsRoot)
  const realSessionDir = fs.realpathSync(oldSessionDir)
  assert.equal(summary.deletedSessionCount, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].dirPath, realSessionDir)
  assert.deepEqual(calls[0].allowedRoots, [realStillsRoot])
  fs.rmSync(root, { recursive: true, force: true })
})

test('runAutoSessionCleanup updates last run timestamp after attempt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-auto-cleanup-run-'))
  const contextPath = path.join(root, 'context')
  const stillsRoot = path.join(contextPath, 'familiar', 'stills')
  fs.mkdirSync(stillsRoot, { recursive: true })
  const oldSessionDir = path.join(
    stillsRoot,
    createSessionId(new Date(Date.parse('2026-02-20T00:00:00.000Z') - 8 * 24 * 60 * 60 * 1000))
  )
  fs.mkdirSync(oldSessionDir, { recursive: true })

  const settings = {
    contextFolderPath: contextPath,
    storageAutoCleanupRetentionDays: 2
  }
  const savedPayloads = []
  const runAtMs = Date.parse('2026-02-20T00:00:00.000Z')
  const result = await runAutoSessionCleanup({
    trigger: 'startup',
    nowMs: runAtMs,
    settingsLoader: () => settings,
    settingsSaver: (payload) => {
      savedPayloads.push(payload)
    },
    logger: createTestLogger(),
    deleteDirectory: async (targetPath) => {
      fs.rmSync(targetPath, { recursive: true, force: false })
    }
  })

  assert.equal(result.ok, true)
  assert.equal(savedPayloads.length, 1)
  assert.equal(savedPayloads[0].storageAutoCleanupLastRunAt, runAtMs)
  assert.equal(fs.existsSync(oldSessionDir), false)
  fs.rmSync(root, { recursive: true, force: true })
})

test('runAutoSessionCleanup does not delete sessions when familiar stills root is a symlink', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-auto-cleanup-symlink-root-'))
  const contextPath = path.join(root, 'context')
  const familiarRoot = path.join(contextPath, 'familiar')
  const outsideRoot = path.join(root, 'outside-stills-root')
  const stillsSymlink = path.join(familiarRoot, 'stills')
  const runAtMs = Date.parse('2026-02-20T00:00:00.000Z')
  const oldSessionDir = path.join(
    outsideRoot,
    createSessionId(new Date(runAtMs - 8 * 24 * 60 * 60 * 1000))
  )

  fs.mkdirSync(familiarRoot, { recursive: true })
  fs.mkdirSync(outsideRoot, { recursive: true })
  fs.symlinkSync(outsideRoot, stillsSymlink)
  fs.mkdirSync(oldSessionDir, { recursive: true })

  const savedPayloads = []
  const result = await runAutoSessionCleanup({
    trigger: 'startup',
    nowMs: runAtMs,
    settingsLoader: () => ({
      contextFolderPath: contextPath,
      storageAutoCleanupRetentionDays: 2
    }),
    settingsSaver: (payload) => {
      savedPayloads.push(payload)
    },
    logger: createTestLogger(),
    deleteDirectory: async (targetPath) => {
      fs.rmSync(targetPath, { recursive: true, force: false })
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.summary.deletedSessionCount, 0)
  assert.equal(fs.existsSync(oldSessionDir), true)
  assert.equal(savedPayloads.length, 1)
  assert.equal(savedPayloads[0].storageAutoCleanupLastRunAt, runAtMs)
  fs.rmSync(root, { recursive: true, force: true })
})

test('createAutoSessionCleanupScheduler runs startup and gates daily runs', async () => {
  let nowMs = Date.parse('2026-02-20T00:00:00.000Z')
  const settings = {}
  const calls = []
  let intervalHandler = null
  const scheduler = createAutoSessionCleanupScheduler({
    settingsLoader: () => settings,
    settingsSaver: (payload) => {
      Object.assign(settings, payload)
    },
    nowFn: () => nowMs,
    setIntervalFn: (handler) => {
      intervalHandler = handler
      return 1
    },
    clearIntervalFn: () => {},
    runAutoSessionCleanupFn: async ({ trigger, nowMs: runNow }) => {
      calls.push({ trigger, nowMs: runNow })
      settings.storageAutoCleanupLastRunAt = runNow
      return { ok: true, trigger }
    }
  })

  scheduler.start()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].trigger, 'startup')

  await intervalHandler()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 1)

  nowMs += 24 * 60 * 60 * 1000
  await intervalHandler()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 2)
  assert.equal(calls[1].trigger, 'daily')
})

test('createAutoSessionCleanupScheduler runs non-daily triggers without 24h gate', async () => {
  const nowMs = Date.parse('2026-02-20T00:00:00.000Z')
  const settings = { storageAutoCleanupLastRunAt: nowMs }
  const calls = []
  const scheduler = createAutoSessionCleanupScheduler({
    settingsLoader: () => settings,
    nowFn: () => nowMs,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
    runAutoSessionCleanupFn: async ({ trigger, nowMs: runNow }) => {
      calls.push({ trigger, nowMs: runNow })
      return { ok: true, trigger }
    }
  })

  await scheduler.tryRun('settings-change')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].trigger, 'settings-change')
})
