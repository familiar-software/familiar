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
  meetingRecordingState,
  onMeetingRecordingToggle,
  onRecordingPause,
  onOpenSettings,
  onQuit,
  recordingPaused,
  recordingState,
  recordingStatusIcon
}) {
  const stillsState = recordingState && typeof recordingState === 'object'
    ? recordingState.state
    : ''
  const isRecording = isCaptureActiveState(stillsState)
  const isPaused = Boolean(recordingPaused || (recordingState && recordingState.manualPaused))
  const pauseRemainingMs = recordingState && typeof recordingState.pauseRemainingMs === 'number'
    ? recordingState.pauseRemainingMs
    : 0

  let recordingItem
  if (isPaused) {
    recordingItem = {
      label: formatPausedLabel(pauseRemainingMs),
      toolTip: 'Click to resume',
      click: onRecordingPause
    }
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

  const isMeetingStarting = meetingRecordingState?.isStarting === true ||
    meetingRecordingState?.state === 'starting'
  const isMeetingPrewarming = meetingRecordingState?.isPrewarming === true ||
    meetingRecordingState?.state === 'prewarming'
  const isMeetingStopping = meetingRecordingState?.isStopping === true ||
    meetingRecordingState?.state === 'stopping'
  const isMeetingRecording = meetingRecordingState?.isRecording === true
  const isMeetingChecking = meetingRecordingState?.availability === 'checking'
  const isMeetingUnavailable = meetingRecordingState?.availability === 'unavailable' || (
    meetingRecordingState?.availability === 'available' &&
    meetingRecordingState?.isAvailable === false
  )
  let meetingRecordingLabel = microcopy.tray.meeting.startRecording
  if (isMeetingPrewarming || isMeetingChecking) {
    meetingRecordingLabel = microcopy.tray.meeting.prewarmingRecording
  } else if (isMeetingStarting) {
    meetingRecordingLabel = microcopy.tray.meeting.startingRecording
  } else if (isMeetingStopping) {
    meetingRecordingLabel = microcopy.tray.meeting.stoppingRecording
  } else if (isMeetingRecording) {
    meetingRecordingLabel = microcopy.tray.meeting.stopRecording
  } else if (isMeetingUnavailable) {
    meetingRecordingLabel = microcopy.tray.meeting.unavailableRecording
  }

  const meetingRecordingItem = {
    label: meetingRecordingLabel,
    enabled: !isMeetingStarting && !isMeetingPrewarming &&
      !isMeetingStopping && !isMeetingChecking && !isMeetingUnavailable,
    click: onMeetingRecordingToggle
  }
  if (isMeetingUnavailable && meetingRecordingState?.unavailableReason) {
    meetingRecordingItem.toolTip = meetingRecordingState.unavailableReason
  }

  return [
    meetingRecordingItem,
    recordingItem,
    { label: microcopy.tray.actions.settings, click: onOpenSettings },
    { type: 'separator' },
    { label: microcopy.tray.actions.quit, click: onQuit }
  ]
}

module.exports = { buildTrayMenuTemplate, PAUSE_DURATIONS, formatPausedLabel }
