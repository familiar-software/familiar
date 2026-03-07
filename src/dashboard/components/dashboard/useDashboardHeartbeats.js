import { useCallback } from 'react'

import {
  HEARTBEAT_DEFAULT_TIMEZONE,
  HEARTBEAT_FREQUENCIES,
  HEARTBEAT_RUNNERS,
  HEARTBEAT_TIME_PATTERN,
  HEARTBEAT_TOPIC_PATTERN,
  HEARTBEAT_WEEKDAYS
} from './dashboardConstants'
import { resolveHeartbeatField } from './heartbeat-utils.cjs'
import {
  isExecutableHeartbeatRunner,
  isHeartbeatRunnerAllowedBySkillInstaller,
  normalizeHeartbeatTopic
} from './heartbeat-validation-utils.cjs'

const HEARTBEAT_RUNNER_SET = new Set(HEARTBEAT_RUNNERS.map((entry) => entry.value))
const HEARTBEAT_FREQUENCY_SET = new Set(HEARTBEAT_FREQUENCIES.map((entry) => entry.value))
const HEARTBEAT_DAY_OF_WEEK_SET = new Set(HEARTBEAT_WEEKDAYS.map((entry) => Number.parseInt(entry.value, 10)))

const toSafeString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback)
const toSafeItems = (value) => (Array.isArray(value) ? value : [])
const resolveMessage = (value, fallback = '') => {
  if (value === null || value === undefined) {
    return fallback
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value instanceof Error) {
    return value.message || fallback
  }
  if (typeof value === 'object' && typeof value.message === 'string') {
    return value.message
  }
  return String(value)
}

const isTimezoneSupported = (timezone) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

export const useDashboardHeartbeats = (state) => {
  const {
    familiar,
    mc,
    settings,
    selectedHarnesses,
    setSettings,
    setHeartbeatMessage,
    setHeartbeatError,
    setStorageMessage,
    setStorageError,
    runningHeartbeatIds
  } = state

  const messages = mc?.dashboard?.heartbeats?.messages || {}
  const errors = mc?.dashboard?.heartbeats?.errors || {}
  const settingsErrors = mc?.dashboard?.settings?.errors || {}
  const defaultStatusSaving = mc?.dashboard?.settings?.statusSaving || 'Saving…'
  const defaultStatusSaved = mc?.dashboard?.settings?.statusSaved || 'Saved.'

  const heartbeats = toSafeItems(settings?.heartbeats?.items)

  const persistHeartbeats = useCallback(async (nextItems, options = {}) => {
    const shouldShowStatus = options.showStatus !== false

    if (!familiar || typeof familiar.saveSettings !== 'function') {
      setHeartbeatError(settingsErrors.bridgeUnavailableRestart || 'Bridge unavailable. Restart the app.')
      return { ok: false, message: settingsErrors.bridgeUnavailableRestart || 'Bridge unavailable. Restart the app.' }
    }

    if (shouldShowStatus) {
      setHeartbeatMessage(defaultStatusSaving)
    } else {
      setHeartbeatMessage('')
    }
    setHeartbeatError('')
    setStorageMessage('')
    setStorageError('')

    try {
      const result = await familiar.saveSettings({ heartbeats: { items: nextItems } })
      if (!result || result.ok !== true) {
      setHeartbeatMessage('')
      setHeartbeatError(result?.message || errors.failedToSave || messages.failedToSave || 'Failed to save heartbeat.')
      return { ok: false, message: result?.message || errors.failedToSave || messages.failedToSave || 'Failed to save heartbeat.' }
      }

      setSettings((previous) => ({
        ...previous,
        heartbeats: {
          ...(previous.heartbeats || {}),
          items: nextItems
        }
      }))
      if (shouldShowStatus) {
        setHeartbeatMessage(defaultStatusSaved)
      }
      return { ok: true }
    } catch (error) {
      console.error('Failed to save heartbeats', error)
      setHeartbeatMessage('')
      setHeartbeatError(errors.failedToSave || messages.failedToSave || 'Failed to save heartbeat.')
      return { ok: false, message: errors.failedToSave || messages.failedToSave || 'Failed to save heartbeat.' }
    }
  }, [defaultStatusSaved, defaultStatusSaving, errors.failedToSave, messages.failedToSave, familiar, setHeartbeatError, setHeartbeatMessage, setSettings, setStorageError, setStorageMessage, settingsErrors.bridgeUnavailableRestart])

  const normalizeDayOfWeek = useCallback((value, frequency) => {
    const parsed = Number.parseInt(value, 10)
    if (frequency !== 'weekly' || !Number.isFinite(parsed)) {
      return 1
    }
    return HEARTBEAT_DAY_OF_WEEK_SET.has(parsed) ? parsed : null
  }, [])

  const saveHeartbeat = useCallback(async (payload = {}, options = {}) => {
    const nowMs = Date.now()
    const existing = toSafeItems(heartbeats)
    const heartbeatId = toSafeString(payload.id)
    const topic = normalizeHeartbeatTopic(payload.topic)
    const prompt = toSafeString(payload.prompt)
    const runner = toSafeString(payload.runner)
    const frequency = resolveHeartbeatField(payload, 'frequency')
    const time = resolveHeartbeatField(payload, 'time')
    const timezone = resolveHeartbeatField(payload, 'timezone', HEARTBEAT_DEFAULT_TIMEZONE)
    const enabled = payload.enabled !== false
    const target = existing.find((entry) => entry.id === heartbeatId)
    const dayOfWeek = normalizeDayOfWeek(resolveHeartbeatField(payload, 'dayOfWeek'), frequency)

    if (!HEARTBEAT_TOPIC_PATTERN.test(topic)) {
      const message = messages.noTopic || 'Topic is required and must match letters, numbers, underscore, or hyphen.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    if (!prompt) {
      const message = messages.noPrompt || 'Prompt is required.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    if (!HEARTBEAT_RUNNER_SET.has(runner)) {
      const message = 'Unsupported heartbeat runner.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    if (!isHeartbeatRunnerAllowedBySkillInstaller({ runner, skillInstaller: { harness: selectedHarnesses } })) {
      const message = messages.runnerNotConfigured || 'Only allowed for options picked in "Connect Agent".'
      console.warn('Rejected heartbeat save: runner not enabled in Connect Agent', {
        runner,
        selectedHarnesses
      })
      setHeartbeatError(message)
      return { ok: false, message }
    }

    if (!isExecutableHeartbeatRunner(runner)) {
      const message = 'Unsupported heartbeat runner.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    if (!HEARTBEAT_FREQUENCY_SET.has(frequency)) {
      const message = 'Unsupported heartbeat frequency.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    if (!HEARTBEAT_TIME_PATTERN.test(time)) {
      const message = messages.invalidTime || 'Time must be HH:mm.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    if (!isTimezoneSupported(timezone)) {
      const message = messages.invalidTimezone || 'Please select a valid timezone.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    if (frequency === 'weekly' && dayOfWeek === null) {
      const message = messages.invalidTime || messages.invalidTimezone || 'Invalid weekly schedule.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    const duplicate = existing.some((entry) => entry.id !== heartbeatId && entry.topic === topic)
    if (duplicate) {
      const message = errors.duplicateTopic || 'A heartbeat already exists with this topic.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    const nextItem = {
      id: heartbeatId || `heartbeat-${nowMs}`,
      topic,
      prompt,
      runner,
      schedule: {
        frequency,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : 1,
        time,
        timezone
      },
      enabled,
      createdAt: Number.isFinite(target?.createdAt) ? target.createdAt : nowMs,
      updatedAt: nowMs,
      lastAttemptedScheduledAt: Number.isFinite(target?.lastAttemptedScheduledAt)
        ? target.lastAttemptedScheduledAt
        : 0,
      lastRunAt: Number.isFinite(target?.lastRunAt) ? target.lastRunAt : 0,
      lastRunStatus: toSafeString(target?.lastRunStatus),
      lastRunError: toSafeString(target?.lastRunError),
      outputPath: toSafeString(target?.outputPath)
    }

    const nextItems = heartbeatId
      ? existing.map((entry) => (entry.id === heartbeatId ? nextItem : entry))
      : [...existing, nextItem]

    const result = await persistHeartbeats(nextItems, options)
    if (!result.ok) {
      return result
    }
    return { ok: true, heartbeat: nextItem }
  }, [errors.duplicateTopic, heartbeats, messages.invalidTimezone, messages.invalidTime, messages.noPrompt, messages.noTopic, messages.runnerNotConfigured, persistHeartbeats, normalizeDayOfWeek, selectedHarnesses, setHeartbeatError])

  const deleteHeartbeat = useCallback(async (heartbeatId) => {
    const existing = toSafeItems(heartbeats)
    const nextItems = existing.filter((entry) => entry.id !== heartbeatId)
    if (nextItems.length === existing.length) {
      const message = messages.notFound || 'Heartbeat not found.'
      setHeartbeatError(message)
      return { ok: false, message }
    }
    const result = await persistHeartbeats(nextItems)
    return result
  }, [heartbeats, messages.notFound, persistHeartbeats, setHeartbeatError])

  const setHeartbeatEnabled = useCallback(async (heartbeatId, enabled) => {
    const existing = toSafeItems(heartbeats)
    const target = existing.find((entry) => entry.id === heartbeatId)
    if (!target) {
      const message = messages.notFound || 'Heartbeat not found.'
      setHeartbeatError(message)
      return { ok: false, message }
    }
    return saveHeartbeat({ ...target, enabled }, { showStatus: false })
  }, [heartbeats, messages.notFound, saveHeartbeat, setHeartbeatError])

  const runHeartbeatNow = useCallback(async (heartbeatId) => {
    if (!familiar || typeof familiar.runHeartbeatNow !== 'function') {
      const message = settingsErrors.bridgeUnavailableRestart || 'Bridge unavailable. Restart the app.'
      setHeartbeatError(message)
      return { ok: false, message }
    }
    setHeartbeatError('')
    if (!settings?.contextFolderPath) {
      const message = errors.requiredContextFolder || 'Set a context folder before running or opening heartbeats.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    const result = await familiar.runHeartbeatNow({ heartbeatId })
    if (!result || result.ok !== true) {
      const message = result?.message || errors.failedToRunNow || messages.failedToRunNow || 'Failed to run heartbeat.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    const nowMs = Date.now()
    setHeartbeatMessage(result.message || 'Heartbeat completed.')
    setSettings((previous) => ({
      ...previous,
      heartbeats: {
        ...(previous.heartbeats || {}),
        items: toSafeItems(previous.heartbeats?.items).map((entry) => {
          if (entry.id !== heartbeatId) {
            return entry
          }
          return {
            ...entry,
            lastRunAt: nowMs,
            lastRunStatus: result.status || entry.lastRunStatus,
            lastRunError: result.status === 'ok' ? '' : resolveMessage(result.message),
            outputPath: resolveMessage(result.outputPath, entry.outputPath)
          }
        })
      }
    }))
    return { ok: true, heartbeatId }
  }, [errors.failedToRunNow, errors.requiredContextFolder, familiar, heartbeats, saveHeartbeat, saveHeartbeat, setHeartbeatError, setHeartbeatMessage, settings?.contextFolderPath, setSettings])

  const openHeartbeatsFolder = useCallback(async () => {
    if (!familiar || typeof familiar.openHeartbeatsFolder !== 'function') {
      const message = settingsErrors.bridgeUnavailableRestart || 'Bridge unavailable. Restart the app.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    if (!settings?.contextFolderPath) {
      const message = errors.requiredContextFolder || 'Set a context folder before running or opening heartbeats.'
      setHeartbeatError(message)
      return { ok: false, message }
    }

    const result = await familiar.openHeartbeatsFolder()
    if (!result || result.ok !== true) {
      const message = result?.message || errors.failedToOpenFolder || 'Failed to open heartbeats folder.'
      setHeartbeatError(message)
      return { ok: false, message }
    }
    setHeartbeatMessage('')
    setHeartbeatError('')
    return { ok: true }
  }, [errors.failedToOpenFolder, errors.requiredContextFolder, familiar, setHeartbeatError, setHeartbeatMessage, settings?.contextFolderPath, setSettings])

  const clearHeartbeatFeedback = useCallback(() => {
    setHeartbeatMessage('')
    setHeartbeatError('')
  }, [setHeartbeatMessage, setHeartbeatError])

  return {
    heartbeats,
    saveHeartbeat,
    deleteHeartbeat,
    setHeartbeatEnabled,
    runHeartbeatNow,
    openHeartbeatsFolder,
    clearHeartbeatFeedback,
    runningHeartbeatIds
  }
}
