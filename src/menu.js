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
  const recordingLabel = recordingPaused
    ? 'Resume Recording'
    : isRecording
      ? 'Pause Recording (10 min)'
      : 'Start Recording'
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
