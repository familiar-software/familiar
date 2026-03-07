import { resolveAutoCleanupRetentionDays } from './dashboardUtils'

export const useDashboardStorage = (state, lifecycle) => {
  const {
    familiar,
    mc,
    settings,
    setSettings,
    saveSettings,
    setStorageMessage,
    setStorageError,
    setDeleteBusy,
    deleteWindow,
    setStorageDeleteMessage,
    setStorageDeleteError,
    setRecordingMessage,
    setRecordingError,
    setCopyLogMessage,
    setCopyLogError,
    localFormatters,
    isCopyingDebugLog,
    setIsCopyingDebugLog,
    setContextFolderMoveInProgress,
    contextFolderMoveInProgress
  } = state

  const { refreshStorageUsage, refreshRecordingStatus } = lifecycle || {}

  const setDeleteBusySafe = (next) => {
    setDeleteBusy(Boolean(next))
  }

  const setStorageBusyMessage = (value) => {
    if (typeof value === 'string') {
      setStorageMessage(value)
      return
    }
    setStorageMessage('')
  }

  const setStorageBusyError = (value) => {
    if (typeof value === 'string') {
      setStorageError(value)
      return
    }
    setStorageError('')
  }

  const persistStorageRetention = async (nextValue) => {
    if (typeof familiar?.saveSettings !== 'function') {
      setStorageBusyError(mc.dashboard.settings.errors.bridgeUnavailableRestart)
      return false
    }
    const confirmed =
      typeof window !== 'undefined' && window.confirm
        ? window.confirm(localFormatters.autoCleanupRetentionConfirm(nextValue))
        : true
    if (!confirmed) {
      return false
    }

    setStorageBusyMessage(mc.dashboard.settings.statusSaving)
    try {
      const result = await saveSettings({ storageAutoCleanupRetentionDays: nextValue })
      if (result) {
        setSettings((previous) => ({ ...previous, storageAutoCleanupRetentionDays: nextValue }))
        setStorageBusyMessage(mc.dashboard.settings.statusSaved)
        return true
      }
      setStorageBusyMessage('')
      setStorageBusyError(mc.dashboard.settings.errors.failedToSaveSetting)
      return false
    } catch (error) {
      console.error('Failed to save auto cleanup retention', error)
      setStorageBusyMessage('')
      setStorageBusyError(mc.dashboard.settings.errors.failedToSaveSetting)
      return false
    }
  }

  const saveStorageRetention = async (nextValue) => {
    const next = resolveAutoCleanupRetentionDays(nextValue)
    if (next === settings.storageAutoCleanupRetentionDays) {
      return
    }
    const previous = settings.storageAutoCleanupRetentionDays
    const saved = await persistStorageRetention(next)
    if (!saved) {
      setSettings((previousSettings) => ({ ...previousSettings, storageAutoCleanupRetentionDays: previous }))
    }
  }

  const copyDebugLog = async () => {
    if (isCopyingDebugLog) {
      return
    }
    if (!familiar || typeof familiar.copyCurrentLogToClipboard !== 'function') {
      setCopyLogError(mc.dashboard.settings.errors.logCopyUnavailableRestart)
      return
    }

    setIsCopyingDebugLog(true)
    setCopyLogMessage('')
    setCopyLogError('')
    setCopyLogMessage(mc.dashboard.settings.statusCopying)
    try {
      const result = await familiar.copyCurrentLogToClipboard()
      if (result && result.ok) {
        setCopyLogMessage(mc.dashboard.settings.statusCopied)
      } else {
        setCopyLogMessage('')
        setCopyLogError(result?.message || mc.dashboard.settings.errors.failedToCopyLogFile)
      }
    } catch (error) {
      console.error('Failed to copy log file', error)
      setCopyLogMessage('')
      setCopyLogError(mc.dashboard.settings.errors.failedToCopyLogFile)
    } finally {
      setIsCopyingDebugLog(false)
    }
  }

  const deleteRecentFiles = async () => {
    if (!familiar || typeof familiar.deleteFilesAt !== 'function') {
      setStorageError(mc.dashboard.settings.errors.storageCleanupUnavailableRestart)
      return
    }

    setDeleteBusySafe(true)
    setStorageDeleteMessage('')
    setStorageDeleteError('')
    try {
      const requestedAtMs = Date.now()
      const result = await familiar.deleteFilesAt({
        requestedAtMs,
        deleteWindow
      })
      if (result?.ok) {
        setStorageDeleteMessage(result.message || mc.dashboard.settings.deletedFiles)
        if (typeof refreshStorageUsage === 'function') {
          await refreshStorageUsage()
        }
        return
      }
      if (!result?.canceled) {
        setStorageDeleteError(result?.message || mc.dashboard.settings.errors.failedToDeleteFiles)
      }
    } catch (error) {
      console.error('Failed to delete recent files', error)
      setStorageDeleteError(mc.dashboard.settings.errors.failedToDeleteFiles)
    } finally {
      setDeleteBusySafe(false)
      if (typeof refreshStorageUsage === 'function') {
        await refreshStorageUsage()
      }
    }
  }

  const setAlwaysRecord = async (nextValue) => {
    if (!familiar || typeof familiar.saveSettings !== 'function') {
      setRecordingError(mc.dashboard.settings.errors.bridgeUnavailableRestart)
      return false
    }
    if (nextValue === settings.alwaysRecordWhenActive) {
      return true
    }

    setRecordingError('')
    setRecordingMessage(mc.dashboard.settings.statusSaving)
    try {
      const result = await saveSettings({ alwaysRecordWhenActive: nextValue })
      if (result) {
        setSettings((previous) => ({ ...previous, alwaysRecordWhenActive: nextValue }))
        if (typeof refreshRecordingStatus === 'function') {
          await refreshRecordingStatus()
        }
        setRecordingMessage(mc.dashboard.settings.statusSaved)
        return true
      }
      setRecordingMessage('')
      setRecordingError(mc.dashboard.settings.errors.failedToSaveSetting)
      return false
    } catch (error) {
      console.error('Failed to save capture preference', error)
      setRecordingMessage('')
      setRecordingError(mc.dashboard.settings.errors.failedToSaveSetting)
      return false
    }
  }

  const applySavedContextFolder = async (saveResult, options = {}) => {
    if (!saveResult || !saveResult.ok) {
      return false
    }

    const nextContextFolderPath = saveResult.contextFolderPath || options.contextFolderPath
    const nextState = {
      contextFolderPath: nextContextFolderPath
    }
    if (typeof saveResult.alwaysRecordWhenActive === 'boolean') {
      nextState.alwaysRecordWhenActive = saveResult.alwaysRecordWhenActive
    }
    if (typeof options.alwaysRecordWhenActive === 'boolean') {
      nextState.alwaysRecordWhenActive = options.alwaysRecordWhenActive
    }
    setSettings((previous) => ({ ...previous, ...nextState }))
    setStorageBusyMessage(mc.dashboard.settings.statusSaved)
    setStorageBusyError('')
    if (typeof refreshStorageUsage === 'function') {
      await refreshStorageUsage()
    }
    return true
  }

  const pickAndSaveContextFolderPath = async () => {
    setStorageBusyMessage(mc.dashboard.settings.statusOpeningFolderPicker)
    try {
      const result = await familiar.pickContextFolder()
      if (!result || result.canceled || !result.path) {
        setStorageBusyMessage('')
        if (result?.error) {
          setStorageBusyError(result.error)
        }
        return false
      }

      const saveResult = await familiar.saveSettings({ contextFolderPath: result.path })
      if (!saveResult || !saveResult.ok) {
        setStorageBusyMessage('')
        setStorageBusyError(saveResult?.message || mc.dashboard.settings.errors.failedToSaveSettings)
        return false
      }

      const saved = await applySavedContextFolder(saveResult, { contextFolderPath: result.path })
      if (!saved) {
        setStorageBusyError(mc.dashboard.settings.errors.failedToSaveSettings)
        return false
      }
      if (typeof refreshRecordingStatus === 'function') {
        await refreshRecordingStatus()
      }
      return true
    } catch (error) {
      console.error('Failed to pick context folder', error)
      setStorageBusyMessage('')
      setStorageBusyError(mc.dashboard.settings.errors.failedToOpenFolderPicker)
      return false
    }
  }

  const moveContextFolderPath = async (nextContextFolderPath) => {
    setStorageBusyMessage(mc.dashboard.settings.statusMovingContextFolder)
    setContextFolderMoveInProgress(true)
    setStorageBusyError('')
    try {
      if (typeof familiar.moveContextFolder !== 'function') {
        setStorageBusyMessage('')
        setStorageBusyError(mc.dashboard.settings.errors.failedToMoveContextFolder)
        return false
      }
      const result = await familiar.moveContextFolder({ contextFolderPath: nextContextFolderPath })
      if (!result || !result.ok) {
        setStorageBusyMessage('')
        setStorageBusyError(result?.message || mc.dashboard.settings.errors.failedToMoveContextFolder)
        return false
      }

      const saved = await applySavedContextFolder(result, { contextFolderPath: nextContextFolderPath })
      if (!saved) {
        setStorageBusyError(mc.dashboard.settings.errors.failedToMoveContextFolder)
        return false
      }

      if (typeof result.warning === 'string' && result.warning.trim().length > 0) {
        setStorageBusyMessage(mc.dashboard.settings.statusSaved)
        setStorageBusyError(result.warning)
        return true
      }
      return true
    } catch (error) {
      console.error('Failed to move context folder', error)
      setStorageBusyMessage('')
      setStorageBusyError(mc.dashboard.settings.errors.failedToMoveContextFolder)
      return false
    } finally {
      setContextFolderMoveInProgress(false)
    }
  }

  const pickAndMoveContextFolderPath = async () => {
    if (contextFolderMoveInProgress) {
      return
    }
    try {
      const result = await familiar.pickContextFolder()
      if (!result || result.canceled || !result.path) {
        if (result?.error) {
          setStorageBusyError(result.error)
          return
        }
        setStorageBusyMessage('')
        return
      }
      await moveContextFolderPath(result.path)
    } catch (error) {
      console.error('Failed to pick context folder', error)
      setStorageBusyMessage('')
      setStorageBusyError(mc.dashboard.settings.errors.failedToOpenFolderPicker)
    }
  }

  const pickContextFolder = async (isMove = false) => {
    if (!familiar || typeof familiar.pickContextFolder !== 'function') {
      setStorageBusyError(mc.dashboard.settings.errors.failedToOpenFolderPicker)
      return
    }
    if (contextFolderMoveInProgress) {
      return
    }
    if (isMove) {
      const isConfirmed =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(mc.dashboard.settings.confirmMoveContextFolder)
          : true
      if (!isConfirmed) {
        return
      }
      await pickAndMoveContextFolderPath()
      return
    }
    await pickAndSaveContextFolderPath()
  }

  const openCurrentContextFolder = async () => {
    if (!familiar || typeof familiar.openStillsFolder !== 'function' || contextFolderMoveInProgress) {
      return
    }
    try {
      const result = await familiar.openStillsFolder()
      if (!result || result.ok !== true) {
        setStorageBusyError(result?.message || mc.dashboard.settings.errors.failedToOpenFolderPicker)
      } else {
        setStorageBusyError('')
      }
    } catch (error) {
      console.error('Failed to open context folder', error)
      setStorageBusyError(mc.dashboard.settings.errors.failedToOpenFolderPicker)
    }
  }

  const isDeleteControlsDisabled = contextFolderMoveInProgress || !Boolean(settings.contextFolderPath)

  return {
    saveStorageRetention,
    copyDebugLog,
    deleteRecentFiles,
    setAlwaysRecord,
    pickContextFolder,
    openCurrentContextFolder,
    isCopyingDebugLog,
    isDeleteControlsDisabled,
    isContextFolderMoveInProgress: contextFolderMoveInProgress
  }
}
