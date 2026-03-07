const path = require('node:path')

const { createHarnessRunner } = require('../harness-adapters/runner')
const {
  HEARTBEAT_POLL_INTERVAL_MS,
  HEARTBEAT_RETRY_DELAY_MS,
  MAX_HEARTBEAT_ATTEMPTS
} = require('./constants')
const {
  normalizeHeartbeats,
  normalizeHeartbeat,
  resolveTimeParts
} = require('./normalize')
const {
  createHeartbeatRunner
} = require('./runner')
const {
  HEARTBEAT_HISTORY_STATUS
} = require('./store')
const {
  createDefaultFormatters,
  computeLatestDueSlotMs,
  readDatePartsByTimeZone
} = require('./schedule')
const { persistHeartbeatOutput } = require('./output')
const {
  safeFsPath,
  toSafeString
} = require('./utils')

const logger = console

const toUtcIso = (timestampMs) => {
  if (!Number.isFinite(timestampMs)) {
    return ''
  }
  return new Date(timestampMs).toISOString()
}

const buildHeartbeatMetadataUpdate = ({
  item,
  next,
  runAtMs,
  status,
  error = '',
  outputPath = ''
}) => ({
  ...item,
  lastAttemptedScheduledAt: runAtMs,
  lastRunAt: runAtMs,
  lastRunStatus: status,
  lastRunError: error,
  outputPath,
  updatedAt: runAtMs,
  ...next
})

const createHeartbeatScheduler = ({
  settingsLoader,
  settingsSaver,
  runner,
  nowFn = () => Date.now(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  checkIntervalMs = HEARTBEAT_POLL_INTERVAL_MS,
  isCaptureActive = () => true,
  onFailure = null,
  onHeartbeatRunStateChanged = null,
  heartbeatHistoryStoreFactory = null
} = {}) => {
  if (typeof settingsLoader !== 'function') {
    throw new Error('settingsLoader is required')
  }
  if (typeof settingsSaver !== 'function') {
    throw new Error('settingsSaver is required')
  }

  const harnessRunner = runner || createHarnessRunner()
  const heartbeatRunner = createHeartbeatRunner({ harnessRunner, nowFn })
  const formatters = createDefaultFormatters()
  let timer = null
  let isRunning = false

  const persistHeartbeats = ({ items }) => {
    return settingsSaver({ heartbeats: { items } })
  }

  const getContextFolderPath = () => {
    const settings = settingsLoader() || {}
    const contextFolderPath = safeFsPath(settings.contextFolderPath)
    if (!contextFolderPath) {
      throw new Error('Context folder path is required.')
    }
    return path.resolve(contextFolderPath)
  }

  const loadCurrentHeartbeats = () => {
    const settings = settingsLoader() || {}
    const items = settings?.heartbeats && Array.isArray(settings.heartbeats.items)
      ? settings.heartbeats.items
      : []
    return normalizeHeartbeats({ items, nowFn })
  }

  const recordHeartbeatHistory = ({
    heartbeat,
    scheduledAtMs,
    startedAtMs,
    completedAtMs,
    result,
    attemptNumber = 1,
    nextRetryAtMs = null,
    heartbeatHistoryStore = null
  }) => {
    if (!heartbeatHistoryStore || typeof heartbeatHistoryStore.recordHeartbeatRun !== 'function') {
      return
    }

    try {
      heartbeatHistoryStore.recordHeartbeatRun({
        heartbeatId: heartbeat.id,
        topic: heartbeat.topic,
        runner: heartbeat.runner,
        scheduledAtUtc: toUtcIso(scheduledAtMs),
        startedAtUtc: toUtcIso(startedAtMs),
        completedAtUtc: toUtcIso(completedAtMs),
        status: result.status === 'ok'
          ? HEARTBEAT_HISTORY_STATUS.COMPLETED
          : HEARTBEAT_HISTORY_STATUS.FAILED,
        outputPath: result.status === 'ok' ? toSafeString(result.outputPath) : null,
        errorMessage: result.status === 'ok' ? null : toSafeString(result.error),
        attemptNumber,
        nextRetryAtUtc: toUtcIso(nextRetryAtMs) || null
      })
    } catch (error) {
      logger.error('Failed to record heartbeat history', {
        id: heartbeat.id,
        topic: heartbeat.topic,
        message: toSafeString(error?.message, 'Unknown heartbeat history error')
      })
    }
  }

  const getLatestPendingRetry = ({
    heartbeat,
    nowMs,
    heartbeatHistoryStore
  }) => {
    if (!heartbeatHistoryStore || typeof heartbeatHistoryStore.getLatestPendingRetry !== 'function') {
      return null
    }

    try {
      return heartbeatHistoryStore.getLatestPendingRetry({
        heartbeatId: heartbeat.id,
        nowUtc: toUtcIso(nowMs)
      })
    } catch (error) {
      logger.warn('Failed to load pending heartbeat retry', {
        id: heartbeat.id,
        topic: heartbeat.topic,
        message: toSafeString(error?.message, 'Unknown heartbeat retry lookup error')
      })
      return null
    }
  }

  const updateHeartbeatState = async ({ heartbeat, scheduledAtMs, result }) => {
    const nextItems = loadCurrentHeartbeats()
    const nextHeartbeat = nextItems.find((entry) => entry.id === heartbeat.id)
    if (!nextHeartbeat) {
      return false
    }

    const next = buildHeartbeatMetadataUpdate({
      item: nextHeartbeat,
      runAtMs: scheduledAtMs,
      status: result.status,
      error: toSafeString(result.error, ''),
      outputPath: toSafeString(result.outputPath)
    })

    const index = nextItems.findIndex((entry) => entry.id === heartbeat.id)
    if (index < 0) {
      return false
    }

    nextItems[index] = next
    return persistHeartbeats({ items: nextItems })
  }

  const notifyRunState = (payload = {}) => {
    if (typeof onHeartbeatRunStateChanged !== 'function') {
      return
    }
    try {
      onHeartbeatRunStateChanged(payload)
    } catch (error) {
      logger.warn('Failed to notify heartbeat run state', {
        id: payload.id,
        state: payload.state,
        error: error?.message || String(error)
      })
    }
  }

  const runHeartbeat = async ({
    heartbeat,
    contextFolderPath,
    scheduledAtMs,
    trigger = 'manual',
    attemptNumber = 1,
    heartbeatHistoryStore = null
  }) => {
    const startedAtMs = nowFn()
    notifyRunState({
      id: heartbeat.id,
      topic: heartbeat.topic,
      trigger,
      state: 'running',
      scheduledAtMs
    })

    let executionResult = {
      ok: false,
      status: 'error',
      error: 'Heartbeat failed.'
    }

    try {
      executionResult = await heartbeatRunner.runHeartbeatRunner({
        heartbeat,
        scheduledAtMs,
        contextFolderPath
      })
    } catch (error) {
      executionResult = {
        ok: false,
        status: 'error',
        error: toSafeString(error?.message, 'Heartbeat failed.')
      }
    }

    let result = executionResult
    if (executionResult.ok) {
      const writeResult = await persistHeartbeatOutput({
        heartbeat,
        scheduledAtMs,
        contextFolderPath,
        output: executionResult.output,
        fallbackFormatter: formatters.fallbackZoneFormatter
      })

      result = {
        ok: writeResult.ok,
        status: writeResult.ok ? 'ok' : 'error',
        error: writeResult.ok ? executionResult.error : writeResult.error,
        outputPath: writeResult.outputPath,
        output: executionResult.output
      }
    }

    const shouldScheduleRetry = (
      trigger !== 'manual' &&
      result.status !== 'ok' &&
      attemptNumber < MAX_HEARTBEAT_ATTEMPTS
    )
    const nextRetryAtMs = shouldScheduleRetry
      ? nowFn() + HEARTBEAT_RETRY_DELAY_MS
      : null

    await updateHeartbeatState({
      heartbeat,
      scheduledAtMs,
      result
    })

    recordHeartbeatHistory({
      heartbeat,
      contextFolderPath,
      scheduledAtMs,
      startedAtMs,
      completedAtMs: nowFn(),
      result,
      attemptNumber,
      nextRetryAtMs,
      heartbeatHistoryStore
    })

    if (result.status !== 'ok' && !shouldScheduleRetry) {
      const errorMessage = toSafeString(result.error, 'Heartbeat failed.')
      logger.error('Heartbeat failed', {
        id: heartbeat.id,
        topic: heartbeat.topic,
        status: result.status,
        attemptNumber,
        error: errorMessage,
        scheduledAtMs
      })
      if (typeof onFailure === 'function') {
        onFailure({
          title: 'Heartbeat failed',
          body: `${heartbeat.topic || 'Heartbeat'} failed: ${errorMessage}`,
          type: 'warning',
          size: 'compact',
          id: heartbeat.id,
          topic: heartbeat.topic,
          status: result.status,
          attemptNumber,
          message: errorMessage,
          outputPath: toSafeString(result.outputPath),
          scheduledAtMs
        })
      }
    } else if (shouldScheduleRetry) {
      logger.warn('Heartbeat failed and scheduled for retry', {
        id: heartbeat.id,
        topic: heartbeat.topic,
        attemptNumber,
        nextRetryAtMs,
        scheduledAtMs
      })
    }

    notifyRunState({
      id: heartbeat.id,
      topic: heartbeat.topic,
      trigger,
      state: 'completed',
      status: result.status,
      error: toSafeString(result.error),
      outputPath: toSafeString(result.outputPath),
      scheduledAtMs
    })

    return result
  }

  const runDueHeartbeats = async (trigger = 'poll') => {
    const nowMs = nowFn()
    logger.log('Heartbeat worker tick', {
      trigger,
      nowMs
    })

    const captureActive = isCaptureActive()
    if (!captureActive) {
      logger.log('Skipping heartbeat cycle because capture is not active', {
        trigger,
        captureActive
      })
      return {
        ok: true,
        processed: [],
        trigger,
        reason: 'capture-inactive'
      }
    }

    if (isRunning) {
      logger.warn('Skipped heartbeat cycle because another cycle is running', { trigger })
      return { ok: true, reason: 'busy' }
    }

    isRunning = true
    try {
      const contextFolderPath = getContextFolderPath()
      const heartbeatHistoryStore = typeof heartbeatHistoryStoreFactory === 'function'
        ? heartbeatHistoryStoreFactory({ contextFolderPath, logger })
        : null

      try {
        const items = loadCurrentHeartbeats()
        if (items.length === 0) {
          return { ok: true, processed: 0 }
        }

        const processed = []
        for (const item of items) {
          logger.log('Heartbeat check', {
            heartbeatId: item.id,
            topic: item.topic,
            trigger,
            enabled: item.enabled,
            lastAttemptedScheduledAt: item.lastAttemptedScheduledAt
          })
          if (item.enabled !== true) {
            logger.log('Heartbeat check skipped', {
              heartbeatId: item.id,
              topic: item.topic,
              reason: 'disabled'
            })
            continue
          }

          const scheduleTimezone = item.schedule.timezone
          const timezoneParts = readDatePartsByTimeZone(nowMs, scheduleTimezone)
          if (!timezoneParts) {
            logger.warn('Skipping heartbeat due slot compute: invalid timezone', {
              id: item.id,
              topic: item.topic,
              timezone: scheduleTimezone
            })
            continue
          }

          const dueAtMs = computeLatestDueSlotMs({
            frequency: item.schedule.frequency,
            schedule: item.schedule,
            timeZone: scheduleTimezone,
            nowMs,
            nowZoneParts: timezoneParts
          })

          const shouldRun = Number.isFinite(dueAtMs) && dueAtMs > item.lastAttemptedScheduledAt
          logger.log('Heartbeat check evaluation', {
            heartbeatId: item.id,
            topic: item.topic,
            dueAtMs,
            lastAttemptedScheduledAt: item.lastAttemptedScheduledAt,
            shouldRun
          })

          if (shouldRun) {
            logger.log('Heartbeat due', {
              id: item.id,
              topic: item.topic,
              frequency: item.schedule.frequency,
              dueAtMs
            })

            const result = await runHeartbeat({
              heartbeat: item,
              contextFolderPath,
              scheduledAtMs: dueAtMs,
              trigger,
              attemptNumber: 1,
              heartbeatHistoryStore
            })
            processed.push({
              id: item.id,
              topic: item.topic,
              result
            })
            continue
          }

          const pendingRetry = getLatestPendingRetry({
            heartbeat: item,
            nowMs,
            heartbeatHistoryStore
          })
          const pendingRetryScheduledAtMs = pendingRetry
            ? Date.parse(pendingRetry.scheduledAtUtc)
            : NaN
          const shouldRetry = (
            pendingRetry &&
            Number.isFinite(pendingRetryScheduledAtMs) &&
            pendingRetryScheduledAtMs === item.lastAttemptedScheduledAt &&
            pendingRetry.attemptNumber < MAX_HEARTBEAT_ATTEMPTS
          )

          logger.log('Heartbeat retry evaluation', {
            heartbeatId: item.id,
            topic: item.topic,
            pendingRetryScheduledAtMs,
            lastAttemptedScheduledAt: item.lastAttemptedScheduledAt,
            attemptNumber: pendingRetry?.attemptNumber,
            shouldRetry
          })

          if (!shouldRetry) {
            continue
          }

          logger.log('Heartbeat retry due', {
            id: item.id,
            topic: item.topic,
            scheduledAtMs: pendingRetryScheduledAtMs,
            previousAttemptNumber: pendingRetry.attemptNumber
          })

          const result = await runHeartbeat({
            heartbeat: item,
            contextFolderPath,
            scheduledAtMs: pendingRetryScheduledAtMs,
            trigger: 'retry',
            attemptNumber: pendingRetry.attemptNumber + 1,
            heartbeatHistoryStore
          })
          processed.push({
            id: item.id,
            topic: item.topic,
            result
          })
        }

        return {
          ok: true,
          processed,
          trigger
        }
      } finally {
        if (heartbeatHistoryStore && typeof heartbeatHistoryStore.close === 'function') {
          heartbeatHistoryStore.close()
        }
      }
    } finally {
      isRunning = false
    }
  }

  const runHeartbeatNow = async ({ heartbeatId } = {}) => {
    if (!heartbeatId || typeof heartbeatId !== 'string') {
      return { ok: false, message: 'heartbeatId is required.' }
    }

    const contextFolderPath = getContextFolderPath()
    const items = loadCurrentHeartbeats()
    const target = items.find((entry) => entry.id === heartbeatId)
    if (!target) {
      return { ok: false, message: 'Heartbeat not found.' }
    }

    const scheduledAtMs = nowFn()
    logger.log('Running heartbeat immediately', {
      id: target.id,
      topic: target.topic
    })

    const result = await runHeartbeat({
      heartbeat: target,
      contextFolderPath,
      scheduledAtMs,
      trigger: 'manual',
      attemptNumber: 1
    })
    return {
      ok: result.ok,
      status: result.status,
      message: result.ok ? 'Heartbeat completed.' : result.error,
      heartbeatId: target.id,
      topic: target.topic,
      outputPath: result.outputPath || null
    }
  }

  const start = () => {
    if (timer) {
      return { ok: false, reason: 'already-running' }
    }
    logger.log('Starting heartbeat scheduler', { intervalMs: checkIntervalMs })

    timer = setIntervalFn(() => {
      void runDueHeartbeats('poll')
    }, Number.isFinite(checkIntervalMs) && checkIntervalMs > 0 ? checkIntervalMs : HEARTBEAT_POLL_INTERVAL_MS)
    if (timer && typeof timer.unref === 'function') {
      timer.unref()
    }

    void runDueHeartbeats('startup')
    return { ok: true }
  }

  const stop = () => {
    if (!timer) {
      return { ok: true, reason: 'not-running' }
    }
    clearIntervalFn(timer)
    timer = null
    logger.log('Heartbeat scheduler stopped')
    return { ok: true }
  }

  const getState = () => ({
    running: Boolean(timer),
    intervalMs: Number.isFinite(checkIntervalMs) ? checkIntervalMs : HEARTBEAT_POLL_INTERVAL_MS
  })

  return {
    start,
    stop,
    runDueHeartbeats,
    runHeartbeatNow,
    getState
  }
}

module.exports = {
  createHeartbeatScheduler,
  normalizeHeartbeat,
  normalizeHeartbeats,
  resolveTimeParts
}
