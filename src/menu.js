function buildTrayMenuTemplate ({
  onClipboard,
  onRecordingPause,
  onOpenSettings,
  onAbout,
  onRestart,
  onQuit,
  clipboardAccelerator,
  recordingAccelerator,
  recordingPaused
}) {
  const clipboardItem = { label: 'Capture Clipboard', click: onClipboard }
  if (typeof clipboardAccelerator === 'string' && clipboardAccelerator) {
    clipboardItem.accelerator = clipboardAccelerator
  }

  const recordingLabel = recordingPaused ? 'Resume' : '10 Minute Pause'
  const recordingItem = { label: recordingLabel, click: onRecordingPause }
  if (typeof recordingAccelerator === 'string' && recordingAccelerator) {
    recordingItem.accelerator = recordingAccelerator
  }

  return [
    clipboardItem,
    recordingItem,
    { label: 'Dashboard', click: onOpenSettings },
    { label: 'About', click: onAbout },
    { type: 'separator' },
    { label: 'Restart', click: onRestart },
    { label: 'Quit', click: onQuit }
  ]
}

module.exports = { buildTrayMenuTemplate }
