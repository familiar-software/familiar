function buildMeetingRecordingStatus ({
  awakeLockActive,
  availability,
  error,
  locale,
  session,
  state,
  unavailableReason
}) {
  return {
    state,
    isPrewarming: state === 'prewarming',
    isStarting: state === 'starting',
    isStopping: state === 'stopping',
    isRecording: state === 'recording' || state === 'stopping',
    availability,
    isAvailable: availability === 'available',
    unavailableReason: availability === 'unavailable' ? unavailableReason : '',
    locale,
    awakeLockActive,
    sessionId: session?.sessionId || '',
    transcriptMarkdownPath: session?.transcriptMarkdownPath || '',
    error
  }
}

module.exports = {
  buildMeetingRecordingStatus
}
