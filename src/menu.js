function buildTrayMenuTemplate ({
  onRecordingPause,
  onOpenSettings,
  onAbout,
  onRestart,
  onQuit,
  recordingAccelerator,
  recordingPaused,
  recordingState
}) {
  const stillsState = recordingState && typeof recordingState === 'object' ? recordingState.state : ''
  const isRecording = stillsState === 'recording' || stillsState === 'idleGrace'
  const recordingLabel = recordingPaused
    ? 'Resume Screen Stills'
    : isRecording
      ? 'Pause Screen Stills (10 min)'
      : 'Start Screen Stills'
  const recordingItem = { label: recordingLabel, click: onRecordingPause }
  if (typeof recordingAccelerator === 'string' && recordingAccelerator) {
    recordingItem.accelerator = recordingAccelerator
  }

  return [
    recordingItem,
    { label: 'Settings', click: onOpenSettings },
    { label: 'About', click: onAbout },
    { type: 'separator' },
    { label: 'Restart', click: onRestart },
    { label: 'Quit', click: onQuit }
  ]
}

module.exports = { buildTrayMenuTemplate }
