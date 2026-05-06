const { isCaptureActiveState } = require('./recording-status-indicator')
const { microcopy } = require('./microcopy')

const PAUSE_DURATIONS = [
  { label: 'Pause for 5 minutes', durationMs: 5 * 60 * 1000 },
  { label: 'Pause for 10 minutes', durationMs: 10 * 60 * 1000 },
  { label: 'Pause for 30 minutes', durationMs: 30 * 60 * 1000 },
  { label: 'Pause for 1 hour', durationMs: 60 * 60 * 1000 }
]

function formatPausedLabel(remainingMs) {
  const remaining = typeof remainingMs === 'number' ? remainingMs : 0
  if (remaining > 0) {
    const totalSeconds = Math.ceil(remaining / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `Paused \u2014 ${minutes}:${String(seconds).padStart(2, '0')} remaining`
  }
  return 'Paused'
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

  let recordingItem
  if (isPaused) {
    recordingItem = { label: formatPausedLabel(pauseRemainingMs), toolTip: 'Click to resume', click: onRecordingPause }
  } else if (isRecording) {
    recordingItem = {
      label: 'Capturing',
      submenu: PAUSE_DURATIONS.map(({ label, durationMs }) => ({
        label,
        click: () => onRecordingPause(durationMs || undefined)
      }))
    }
  } else {
    recordingItem = { label: microcopy.tray.recording.startCapturing, click: onRecordingPause }
  }

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

module.exports = { buildTrayMenuTemplate, PAUSE_DURATIONS, formatPausedLabel }
