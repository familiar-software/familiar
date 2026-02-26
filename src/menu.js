const { isCaptureActiveState } = require('./recording-status-indicator')
const { microcopy } = require('./microcopy')

function buildTrayMenuTemplate ({
  onRecordingPause,
  onOpenSettings,
  onQuit,
  recordingPaused,
  recordingState,
  recordingStatusIcon
}) {
  const stillsState = recordingState && typeof recordingState === 'object' ? recordingState.state : ''
  const isRecording = isCaptureActiveState(stillsState)
  const isPaused = Boolean(recordingPaused || (recordingState && recordingState.manualPaused))
  const recordingLabel = isPaused
    ? microcopy.tray.recording.pausedFor10MinClickToResume
    : isRecording
      ? microcopy.tray.recording.clickToPauseFor10Min
      : microcopy.tray.recording.startCapturing
  const recordingItem = { label: recordingLabel, click: onRecordingPause }
  if (recordingStatusIcon) {
    recordingItem.icon = recordingStatusIcon
  }

  return [
    recordingItem,
    { label: microcopy.tray.actions.settings, click: onOpenSettings },
    { type: 'separator' },
    { label: microcopy.tray.actions.quit, click: onQuit }
  ]
}

module.exports = { buildTrayMenuTemplate }
