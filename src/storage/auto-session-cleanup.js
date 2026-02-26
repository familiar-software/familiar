const fs = require('node:fs')
const path = require('node:path')
const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME
} = require('../const')
const {
  toRealPathSafe,
  normalizeAllowedRoots,
  isWithinAnyAllowedRoot,
  parseSessionTimestampMs,
  deleteDirectoryIfAllowed
} = require('../ipc/storage')
const {
  DEFAULT_AUTO_CLEANUP_RETENTION_DAYS,
  isAllowedAutoCleanupRetentionDays,
  resolveAutoCleanupRetentionDays
} = require('./auto-cleanup-retention')

const DEFAULT_RETENTION_DAYS = DEFAULT_AUTO_CLEANUP_RETENTION_DAYS
const ALLOWED_RETENTION_DAYS = new Set([2, 7])
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000
const defaultDeleteDirectory = (targetPath) =>
  fs.promises.rm(targetPath, { recursive: true, force: false })

function resolveCleanupRetentionDays({ value, logger = console } = {}) {
  const numericValue = Number(value)
  const resolved = resolveAutoCleanupRetentionDays(value)
  if (isAllowedAutoCleanupRetentionDays(numericValue)) {
    return resolved
  }
  if (value !== undefined && value !== null && value !== '') {
    logger.warn('Invalid auto cleanup retention value. Falling back to default.', {
      value,
      fallback: DEFAULT_RETENTION_DAYS
    })
  }
  return resolved
}

function shouldRunDailyCleanup({ lastCleanupRunAt, nowMs } = {}) {
  return (
    Number.isFinite(nowMs) &&
    (!Number.isFinite(lastCleanupRunAt) || nowMs - lastCleanupRunAt >= DAILY_INTERVAL_MS)
  )
}

function resolveAutoCleanupRoots(contextFolderPath) {
  if (typeof contextFolderPath !== 'string' || contextFolderPath.trim().length === 0) {
    return []
  }
  const familiarRoot = path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME)
  return [path.join(familiarRoot, STILLS_DIR_NAME)]
}

async function cleanupSessionDirectoriesByRetention({
  scanRoots = [],
  options: {
    retentionDays = DEFAULT_RETENTION_DAYS,
    nowMs = Date.now(),
    allowedRoots = [],
    deleteDirectory = defaultDeleteDirectory,
    deleteDirectoryIfAllowedFn = deleteDirectoryIfAllowed,
    logger = console
  } = {}
} = {}) {
  const realAllowedRoots = normalizeAllowedRoots(allowedRoots)
  const cutoffMs = nowMs - retentionDays * DAILY_INTERVAL_MS
  const summary = {
    retentionDays,
    cutoffMs,
    scannedSessionCount: 0,
    eligibleSessionCount: 0,
    deletedSessionCount: 0,
    failedSessionCount: 0,
    skippedInvalidNameCount: 0,
    skippedFutureDatedCount: 0,
    deletedSessionDirs: [],
    failedSessionDirs: []
  }

  if (realAllowedRoots.length === 0) {
    logger.warn('Skipping auto cleanup because allowed roots are empty')
    return summary
  }

  for (const rootPath of scanRoots) {
    const realRootPath = toRealPathSafe(rootPath)
    if (!realRootPath) {
      continue
    }
    if (!isWithinAnyAllowedRoot({ realPath: realRootPath, realAllowedRoots })) {
      logger.warn('Skipping auto cleanup root outside allowed roots', { rootPath })
      continue
    }

    let entries = []
    try {
      entries = fs.readdirSync(realRootPath, { withFileTypes: true })
    } catch (error) {
      logger.warn('Failed to read auto cleanup root', {
        rootPath: realRootPath,
        message: error?.message || String(error)
      })
      continue
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        logger.warn('Skipping symlink directory during auto cleanup scan', {
          sessionDirPath: path.join(realRootPath, entry.name)
        })
        continue
      }
      if (!entry.isDirectory()) {
        continue
      }
      const sessionDirPath = path.join(realRootPath, entry.name)

      const realSessionDirPath = toRealPathSafe(sessionDirPath)
      if (!realSessionDirPath || !isWithinAnyAllowedRoot({ realPath: realSessionDirPath, realAllowedRoots })) {
        logger.warn('Skipping session directory outside allowed roots', { sessionDirPath })
        continue
      }

      const sessionTimestampMs = parseSessionTimestampMs(entry.name)
      if (sessionTimestampMs === null) {
        summary.skippedInvalidNameCount += 1
        logger.warn('Skipping invalid session directory name during auto cleanup', {
          sessionDirPath,
          sessionId: entry.name
        })
        continue
      }

      summary.scannedSessionCount += 1
      if (sessionTimestampMs > nowMs) {
        summary.skippedFutureDatedCount += 1
        logger.warn('Skipping future-dated session directory during auto cleanup', {
          sessionDirPath,
          sessionTimestampMs,
          nowMs
        })
        continue
      }
      if (sessionTimestampMs >= cutoffMs) {
        continue
      }

      summary.eligibleSessionCount += 1
      try {
        const result = await deleteDirectoryIfAllowedFn({
          dirPath: realSessionDirPath,
          options: {
            allowedRoots: realAllowedRoots,
            deleteDirectory,
            logger
          }
        })
        if (result.ok) {
          summary.deletedSessionCount += 1
          summary.deletedSessionDirs.push(realSessionDirPath)
        } else {
          summary.failedSessionCount += 1
          summary.failedSessionDirs.push(realSessionDirPath)
          logger.warn('Auto cleanup refused session directory deletion', {
            sessionDirPath: realSessionDirPath,
            message: result.message
          })
        }
      } catch (error) {
        summary.failedSessionCount += 1
        summary.failedSessionDirs.push(realSessionDirPath)
        logger.error('Failed to delete session directory during auto cleanup', {
          sessionDirPath: realSessionDirPath,
          message: error?.message || String(error)
        })
      }
    }
  }

  return summary
}

async function runAutoSessionCleanup({
  trigger = 'startup',
  settingsLoader,
  settingsSaver,
  nowMs = Date.now(),
  logger = console,
  cleanupSessionDirectoriesByRetentionFn = cleanupSessionDirectoriesByRetention,
  deleteDirectory = defaultDeleteDirectory
} = {}) {
  if (typeof settingsLoader !== 'function') {
    throw new Error('settingsLoader is required')
  }

  const settings = settingsLoader() || {}
  const contextFolderPath =
    typeof settings.contextFolderPath === 'string' ? settings.contextFolderPath : ''
  if (!contextFolderPath) {
    logger.warn('Skipping auto session cleanup because context folder path is not configured', {
      trigger
    })
    return { ok: true, skipped: true, reason: 'missing-context-folder', trigger }
  }

  const retentionDays = resolveCleanupRetentionDays({
    value: settings.storageAutoCleanupRetentionDays,
    logger
  })
  const allowedRoots = resolveAutoCleanupRoots(contextFolderPath)
  logger.log('Starting auto session cleanup', {
    trigger,
    retentionDays,
    roots: allowedRoots
  })

  let summary = null
  try {
    summary = await cleanupSessionDirectoriesByRetentionFn({
      scanRoots: allowedRoots,
      options: {
        retentionDays,
        nowMs,
        allowedRoots,
        deleteDirectory,
        logger
      }
    })
  } finally {
    if (typeof settingsSaver === 'function') {
      try {
        settingsSaver({ storageAutoCleanupLastRunAt: nowMs })
      } catch (error) {
        logger.warn('Failed to persist auto cleanup last run timestamp', {
          message: error?.message || String(error)
        })
      }
    }
  }

  logger.log('Auto session cleanup completed', {
    trigger,
    retentionDays,
    scannedSessionCount: summary.scannedSessionCount,
    eligibleSessionCount: summary.eligibleSessionCount,
    deletedSessionCount: summary.deletedSessionCount,
    failedSessionCount: summary.failedSessionCount,
    skippedInvalidNameCount: summary.skippedInvalidNameCount,
    skippedFutureDatedCount: summary.skippedFutureDatedCount
  })

  return {
    ok: summary.failedSessionCount === 0,
    trigger,
    retentionDays,
    summary
  }
}

function createAutoSessionCleanupScheduler({
  settingsLoader,
  settingsSaver,
  logger = console,
  nowFn = () => Date.now(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  runAutoSessionCleanupFn = runAutoSessionCleanup
} = {}) {
  if (typeof settingsLoader !== 'function') {
    throw new Error('settingsLoader is required')
  }
  if (typeof runAutoSessionCleanupFn !== 'function') {
    throw new Error('runAutoSessionCleanupFn is required')
  }
  let timer = null

  const tryRun = async (trigger) => {
    const nowMs = nowFn()
    if (!Number.isFinite(nowMs)) {
      return { ok: false, skipped: true, reason: 'invalid-clock', trigger }
    }

    if (trigger === 'daily') {
      const settings = settingsLoader() || {}
      const lastCleanupRunAt = Number(settings.storageAutoCleanupLastRunAt)
      if (!shouldRunDailyCleanup({ lastCleanupRunAt, nowMs })) {
        return { ok: true, skipped: true, reason: 'daily-gate', trigger }
      }
    }

    try {
      return await runAutoSessionCleanupFn({
        trigger,
        settingsLoader,
        settingsSaver,
        nowMs,
        logger
      })
    } catch (error) {
      logger.error('Auto session cleanup run failed', {
        trigger,
        message: error?.message || String(error)
      })
      return { ok: false, trigger, message: error?.message || String(error) }
    }
  }

  return {
    start() {
      void tryRun('startup')
      timer = setIntervalFn(() => {
        void tryRun('daily')
      }, checkIntervalMs)
    },
    stop() {
      if (timer) {
        clearIntervalFn(timer)
        timer = null
      }
    },
    tryRun
  }
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  ALLOWED_RETENTION_DAYS,
  DAILY_INTERVAL_MS,
  DEFAULT_CHECK_INTERVAL_MS,
  parseSessionTimestampMs,
  resolveCleanupRetentionDays,
  shouldRunDailyCleanup,
  resolveAutoCleanupRoots,
  cleanupSessionDirectoriesByRetention,
  runAutoSessionCleanup,
  createAutoSessionCleanupScheduler
}
