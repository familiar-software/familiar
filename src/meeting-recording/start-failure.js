const START_HELPER_MAX_ATTEMPTS = 3
const STDERR_TAIL_MAX_CHARS = 2000

function isRetryableStartError (error) {
  const message = error?.message || String(error)
  return error?.signal === 'SIGKILL' || message.includes('signal SIGKILL')
}

function buildStartFailureDiagnostics ({ error, attempt, stderrBuffer }) {
  return {
    phase: 'start_capture',
    attempt,
    maxAttempts: START_HELPER_MAX_ATTEMPTS,
    helperPid: error?.pid || null,
    signal: error?.signal || '',
    helperPath: error?.helperPath || '',
    message: error?.message || String(error),
    stderrTail: stderrBuffer.trim().slice(-STDERR_TAIL_MAX_CHARS)
  }
}

function attachStartFailureDiagnostics (error, diagnostics) {
  if (error && typeof error === 'object') {
    error.meetingRecording = diagnostics
    return error
  }
  const wrapped = new Error(String(error))
  wrapped.meetingRecording = diagnostics
  return wrapped
}

module.exports = {
  START_HELPER_MAX_ATTEMPTS,
  STDERR_TAIL_MAX_CHARS,
  attachStartFailureDiagnostics,
  buildStartFailureDiagnostics,
  isRetryableStartError
}
