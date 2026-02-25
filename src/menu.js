const { isCaptureActiveState } = require('./recording-status-indicator')

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
    ? 'Paused for 10 min (click to resume)'
    : isRecording
      ? 'Click to pause for 10 min'
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
