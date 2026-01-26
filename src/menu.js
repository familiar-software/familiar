function formatHistoryLabel (flow, index) {
  const summary = typeof flow?.summary === 'string' && flow.summary.trim().length > 0
    ? flow.summary.trim()
    : typeof flow?.trigger === 'string' && flow.trigger.trim().length > 0
      ? flow.trigger.trim()
      : 'Recent flow'
  const status = typeof flow?.status === 'string' && flow.status.trim().length > 0
    ? flow.status.trim()
    : 'in_progress'
  const prefix = index === 0 ? 'Last' : 'Recent'
  return `${prefix}: ${summary} (${status})`
}

function buildTrayMenuTemplate ({
  onCapture,
  onClipboard,
  onOpenSettings,
  onAbout,
  onRestart,
  onQuit,
  captureAccelerator,
  clipboardAccelerator,
  historyItems
}) {
  const captureItem = { label: 'Capture Selection', click: onCapture }
  if (typeof captureAccelerator === 'string' && captureAccelerator) {
    captureItem.accelerator = captureAccelerator
  }

  const clipboardItem = { label: 'Capture Clipboard', click: onClipboard }
  if (typeof clipboardAccelerator === 'string' && clipboardAccelerator) {
    clipboardItem.accelerator = clipboardAccelerator
  }

  const items = []
  if (Array.isArray(historyItems) && historyItems.length > 0) {
    const recentItems = historyItems.slice(0, 3).map((flow, index) => ({
      label: formatHistoryLabel(flow, index),
      enabled: false
    }))
    items.push(...recentItems, { type: 'separator' })
  }

  return [
    ...items,
    captureItem,
    clipboardItem,
    { label: 'Dashboard', click: onOpenSettings },
    { label: 'About', click: onAbout },
    { type: 'separator' },
    { label: 'Restart', click: onRestart },
    { label: 'Quit', click: onQuit }
  ]
}

module.exports = { buildTrayMenuTemplate }
