const { isCaptureActiveState } = require('./recording-status-indicator')

function formatPauseRemainingMinutes(remainingMs = 0) {
  const normalizedMs = Number.isFinite(remainingMs) ? Math.max(0, Math.floor(remainingMs)) : 0
  const minutes = Math.ceil(normalizedMs / 60000)
  return `${Math.max(1, minutes)}m`
}

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
  const pauseRemainingMs = recordingState && typeof recordingState.pauseRemainingMs === 'number'
    ? recordingState.pauseRemainingMs
    : 0
  const recordingLabel = isPaused
    ? `Paused for ${formatPauseRemainingMinutes(pauseRemainingMs)} (click to resume)`
    : isRecording
      ? 'Capturing (click to pause)'
      : 'Start Capturing'
  const recordingItem = { label: recordingLabel, click: onRecordingPause }
  if (recordingStatusIcon) {
    recordingItem.icon = recordingStatusIcon
  }

  return [
    recordingItem,
    { label: 'Settings', click: onOpenSettings },
    { type: 'separator' },
    { label: 'Quit', click: onQuit }
  ]
}

module.exports = { buildTrayMenuTemplate }
