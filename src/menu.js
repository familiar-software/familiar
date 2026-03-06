const { isCaptureActiveState } = require('./recording-status-indicator')
const { microcopy } = require('./microcopy')

const toSafeString = (value, fallback = '') =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback

const formatHeartbeatCompletedAt = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return ''
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed)
}

const buildHeartbeatMenuItems = ({
  recentHeartbeats = [],
  onOpenHeartbeat
} = {}) => {
  const items = Array.isArray(recentHeartbeats) ? recentHeartbeats : []
  if (items.length === 0) {
    return []
  }

  const sectionTitle = {
    label: microcopy.tray.heartbeats.section,
    enabled: false
  }

  const heartbeatItems = items.map((entry = {}) => {
    const topic = toSafeString(entry.topic, 'Heartbeat')
    const completedAtText = formatHeartbeatCompletedAt(entry.completedAtUtc)
    const isFailed = toSafeString(entry.status) === 'failed'
    const label = [
      isFailed ? `${topic} (failed)` : topic,
      completedAtText
    ].filter(Boolean).join(' - ')

    return {
      label,
      click: () => {
        if (typeof onOpenHeartbeat === 'function') {
          onOpenHeartbeat(entry)
        }
      }
    }
  })

  return [
    { type: 'separator' },
    sectionTitle,
    ...heartbeatItems,
    { type: 'separator' }
  ]
}

function buildTrayMenuTemplate ({
  onRecordingPause,
  onOpenHeartbeat,
  onOpenSettings,
  onQuit,
  recentHeartbeats = [],
  recordingPaused,
  recordingState,
  recordingStatusIcon
}) {
  const stillsState = recordingState && typeof recordingState === 'object' ? recordingState.state : ''
  const isRecording = isCaptureActiveState(stillsState)
  const isPaused = Boolean(recordingPaused || (recordingState && recordingState.manualPaused))
  const recordingLabel = isPaused
    ? microcopy.tray.recording.pausedFor10MinClickToResume
    : isRecording
      ? microcopy.tray.recording.clickToPauseFor10Min
      : microcopy.tray.recording.startCapturing
  const recordingItem = { label: recordingLabel, click: onRecordingPause }
  if (recordingStatusIcon) {
    recordingItem.icon = recordingStatusIcon
  }

  return [
    recordingItem,
    ...buildHeartbeatMenuItems({
      recentHeartbeats,
      onOpenHeartbeat
    }),
    { label: microcopy.tray.actions.settings, click: onOpenSettings },
    { type: 'separator' },
    { label: microcopy.tray.actions.quit, click: onQuit }
  ]
}

module.exports = { buildTrayMenuTemplate }
