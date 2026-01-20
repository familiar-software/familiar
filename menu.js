function buildTrayMenuTemplate ({ onCapture, onOpenSettings, onAbout, onRestart, onQuit }) {
  return [
    { label: 'Capture Selection', click: onCapture },
    { label: 'Open Settings', click: onOpenSettings },
    { label: 'About', click: onAbout },
    { type: 'separator' },
    { label: 'Restart', click: onRestart },
    { label: 'Quit', click: onQuit }
  ]
}

module.exports = { buildTrayMenuTemplate }
