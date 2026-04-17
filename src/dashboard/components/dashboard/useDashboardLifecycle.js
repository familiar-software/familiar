import { useCallback, useEffect } from 'react'

export const useDashboardLifecycle = (state) => {
  const {
    familiar,
    mc,
    applySettingsDefaults,
    hasLoadedSettingsRef,
    isLoadingSettingsRef,
    lastWindowOpenStorageRefreshRef,
    mountedRef,
    setGlobalError,
    setGlobalMessage,
    setIsSkillInstalled,
    setSkillMessage,
    setSkillError,
    hasManualHarnessSelectionRef,
    setStorageUsage,
    setStorageError,
    setStorageUsageLoaded,
    setRecordingStatus,
    setSettingsLoaded,
    setSettings
  } = state

  const refreshStorageUsage = useCallback(async () => {
    if (!familiar || typeof familiar.getStorageUsageBreakdown !== 'function') {
      setStorageError(mc.dashboard.settings.errors.failedToLoadStorageUsage)
      setStorageUsageLoaded(true)
      return
    }
    setStorageUsageLoaded(false)
    try {
      const result = await familiar.getStorageUsageBreakdown()
      if (result && result.ok) {
        setStorageUsage({
          screenshotsBytes: Number.isFinite(result.screenshotsBytes) ? result.screenshotsBytes : 0,
          steelsMarkdownBytes: Number.isFinite(result.steelsMarkdownBytes) ? result.steelsMarkdownBytes : 0
        })
        setStorageUsageLoaded(true)
        return
      }
      setStorageError(result?.message || mc.dashboard.settings.errors.failedToLoadStorageUsage)
      setStorageUsageLoaded(true)
    } catch (error) {
      console.error('Failed to load storage usage', error)
      setStorageError(mc.dashboard.settings.errors.failedToLoadStorageUsage)
      setStorageUsageLoaded(true)
    }
  }, [
    familiar,
    mc.dashboard.settings.errors.failedToLoadStorageUsage,
    setStorageError,
    setStorageUsage,
    setStorageUsageLoaded
  ])

  const refreshRecordingStatus = useCallback(async () => {
    if (!familiar || typeof familiar.getScreenStillsStatus !== 'function') {
      return
    }
    try {
      const result = await familiar.getScreenStillsStatus()
      if (result && result.ok) {
        setRecordingStatus({
          state: result.state || 'disabled',
          manualPaused: Boolean(result.manualPaused),
          enabled: Boolean(result.enabled),
          permissionGranted:
            typeof result.permissionGranted === 'boolean'
              ? result.permissionGranted
              : result.permissionStatus === 'granted',
          permissionStatus:
            typeof result.permissionStatus === 'string'
              ? result.permissionStatus
              : 'unknown'
        })
      }
    } catch (error) {
      console.error('Failed to load recording status', error)
    }
  }, [familiar, setRecordingStatus])

  const loadSettings = useCallback(async () => {
    if (hasLoadedSettingsRef.current) {
      return { ok: true, reason: 'already-loaded' }
    }

    if (isLoadingSettingsRef.current) {
      return { ok: false }
    }
    isLoadingSettingsRef.current = true

    if (!familiar || typeof familiar.getSettings !== 'function') {
      setGlobalError(mc.dashboard.settings.errors.bridgeUnavailableRestart)
      setGlobalMessage('')
      setSettingsLoaded(true)
      isLoadingSettingsRef.current = false
      return { ok: false, reason: 'bridgeUnavailable' }
    }

    if (!hasLoadedSettingsRef.current) {
      setGlobalMessage(mc.dashboard.settings.statusUpdating)
    }

    try {
      const result = await familiar.getSettings()
      const appliedSettings = applySettingsDefaults(result)
      await refreshStorageUsage()

      if (!hasManualHarnessSelectionRef.current) {
        setIsSkillInstalled(false)
        setSkillMessage('')
        setSkillError('')
      }

      setGlobalMessage('')
      hasLoadedSettingsRef.current = true
      setSettingsLoaded(true)
      return { ok: true, settings: appliedSettings }
    } catch (error) {
      console.error('Failed to load settings', error)
      setGlobalError(mc.dashboard.settings.errors.failedToLoadSettings)
      setGlobalMessage('')
      setIsSkillInstalled(false)
      setSettingsLoaded(true)
      return { ok: false, error }
    } finally {
      isLoadingSettingsRef.current = false
    }
  }, [
    applySettingsDefaults,
    familiar,
    hasLoadedSettingsRef,
    isLoadingSettingsRef,
    mc.dashboard.settings.errors.bridgeUnavailableRestart,
    mc.dashboard.settings.errors.failedToLoadSettings,
    mc.dashboard.settings.statusUpdating,
    hasManualHarnessSelectionRef,
    refreshStorageUsage,
    setGlobalError,
    setGlobalMessage,
    setIsSkillInstalled,
    setSettingsLoaded,
    setSettings,
    setSkillMessage,
    setSkillError,
    setStorageError
  ])

  const refreshStorageUsageFromWindowOpen = useCallback(async () => {
    const now = Date.now()
    if (now - lastWindowOpenStorageRefreshRef.current < 1500) {
      return
    }
    lastWindowOpenStorageRefreshRef.current = now
    await refreshStorageUsage()
  }, [refreshStorageUsage, lastWindowOpenStorageRefreshRef])

  const applyRecordingStatusFromPayload = useCallback((payload = {}) => {
    if (!payload || typeof payload !== 'object') {
      return
    }
    const permissionStatus = typeof payload.permissionStatus === 'string' ? payload.permissionStatus : 'unknown'
    setRecordingStatus({
      state: payload.state || 'disabled',
      manualPaused: Boolean(payload.manualPaused),
      enabled: Boolean(payload.enabled),
      permissionGranted:
        typeof payload.permissionGranted === 'boolean'
          ? payload.permissionGranted
          : permissionStatus === 'granted',
      permissionStatus
    })
  }, [setRecordingStatus])

  useEffect(() => {
    mountedRef.current = true
    void loadSettings()

    const statusInterval = setInterval(() => {
      void refreshRecordingStatus()
    }, 2000)

    const unsubscribeSettings =
      typeof familiar?.onSettingsWindowOpened === 'function'
        ? familiar.onSettingsWindowOpened(() => {
            void refreshStorageUsageFromWindowOpen()
          })
        : null

    const unsubscribeAlwaysRecord =
      typeof familiar?.onAlwaysRecordWhenActiveChanged === 'function'
        ? familiar.onAlwaysRecordWhenActiveChanged((payload) => {
            if (!payload || typeof payload.enabled !== 'boolean') {
              return
            }
            setSettings((previous) => ({ ...previous, alwaysRecordWhenActive: payload.enabled }))
          })
        : null
    const unsubscribeScreenStillsState =
      typeof familiar?.onScreenStillsStateChanged === 'function'
        ? familiar.onScreenStillsStateChanged(applyRecordingStatusFromPayload)
        : null

    return () => {
      mountedRef.current = false
      clearInterval(statusInterval)
      if (unsubscribeSettings) {
        unsubscribeSettings()
      }
      if (unsubscribeAlwaysRecord) {
        unsubscribeAlwaysRecord()
      }
      if (unsubscribeScreenStillsState) {
        unsubscribeScreenStillsState()
      }
    }
  }, [
    familiar,
    applyRecordingStatusFromPayload,
    loadSettings,
    mountedRef,
    refreshRecordingStatus,
    refreshStorageUsageFromWindowOpen,
    setSettings
  ])

  return {
    refreshStorageUsage,
    refreshRecordingStatus,
    loadSettings,
    refreshStorageUsageFromWindowOpen
  }
}
