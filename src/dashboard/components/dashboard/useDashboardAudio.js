export const useDashboardAudio = (state) => {
  const {
    familiar,
    mc,
    saveSettings,
    setSettings,
    setAudioMessage,
    setAudioError
  } = state

  const saveMeetingRecordingShortcut = async (shortcut) => {
    if (!familiar || typeof familiar.saveSettings !== 'function') {
      setAudioError(mc.dashboard.settings.errors.bridgeUnavailableRestart)
      return false
    }

    const nextShortcut = typeof shortcut === 'string' && shortcut.trim().length > 0
      ? shortcut.trim()
      : null

    setAudioMessage(mc.dashboard.settings.statusSaving)
    setAudioError('')

    try {
      const ok = await saveSettings({ meetingRecordingShortcut: nextShortcut })
      if (!ok) {
        setAudioMessage('')
        setAudioError(mc.dashboard.settings.errors.failedToSaveSetting)
        return false
      }

      setSettings((previous) => ({
        ...previous,
        meetingRecordingShortcut: nextShortcut
      }))
      setAudioMessage(mc.dashboard.settings.statusSaved)
      setAudioError('')
      return true
    } catch (error) {
      setAudioMessage('')
      setAudioError(mc.dashboard.settings.errors.failedToSaveSetting)
      return false
    }
  }

  return {
    saveMeetingRecordingShortcut
  }
}
