function buildTrayMenuTemplate ({
  onClipboard,
  onOpenSettings,
  onAbout,
  onRestart,
  onQuit,
  clipboardAccelerator
}) {
  const clipboardItem = { label: 'Capture Clipboard', click: onClipboard }
  if (typeof clipboardAccelerator === 'string' && clipboardAccelerator) {
    clipboardItem.accelerator = clipboardAccelerator
  }

  return [
    clipboardItem,
    { label: 'Dashboard', click: onOpenSettings },
    { label: 'About', click: onAbout },
    { type: 'separator' },
    { label: 'Restart', click: onRestart },
    { label: 'Quit', click: onQuit }
  ]
}

module.exports = { buildTrayMenuTemplate }
