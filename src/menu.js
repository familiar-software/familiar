function buildTrayMenuTemplate ({
  onClipboard,
  onRecordingPause,
  onOpenSettings,
  onAbout,
  onRestart,
  onQuit,
  clipboardAccelerator,
  recordingAccelerator,
  recordingPaused,
  recordingState
}) {
  const clipboardItem = { label: 'Capture Clipboard', click: onClipboard }
  if (typeof clipboardAccelerator === 'string' && clipboardAccelerator) {
    clipboardItem.accelerator = clipboardAccelerator
  }

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
    clipboardItem,
    recordingItem,
    { label: 'Settings', click: onOpenSettings },
    { label: 'About', click: onAbout },
    { type: 'separator' },
    { label: 'Restart', click: onRestart },
    { label: 'Quit', click: onQuit }
  ]
}

module.exports = { buildTrayMenuTemplate }
