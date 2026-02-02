const GEMINI_UNAVAILABLE_MESSAGE = 'Recording queries are available only for Gemini right now.'

const getRecordingQueryAvailability = ({ provider, apiKey } = {}) => {
  if (provider !== 'gemini' || !apiKey) {
    return { available: false, reason: GEMINI_UNAVAILABLE_MESSAGE }
  }
  return { available: true }
}

module.exports = {
  GEMINI_UNAVAILABLE_MESSAGE,
  getRecordingQueryAvailability
}
