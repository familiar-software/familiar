const test = require('node:test')
const assert = require('node:assert/strict')

const makeElement = (initialValue = '') => {
  const element = {
    value: initialValue,
    textContent: '',
    disabled: false,
    hidden: false,
    handlers: {},
    classList: {
      toggle: (_cls, hidden) => {
        element.hidden = Boolean(hidden)
      }
    },
    addEventListener: (event, handler) => {
      element.handlers[event] = handler
    }
  }
  return element
}

test('recording query UI validates missing question', () => {
  const originalWindow = global.window
  global.window = {}
  const { createRecording } = require('../../src/dashboard/recording')

  const recordingQueryQuestion = makeElement('')
  const recordingQueryFrom = makeElement('2025-01-01')
  const recordingQueryTo = makeElement('2025-01-01')
  const recordingQuerySubmit = makeElement()
  const recordingQueryError = makeElement()
  const recordingQueryAnswer = makeElement()
  const recordingQueryAvailability = makeElement()
  const recordingQueryEstimate = makeElement()
  const recordingQuerySpinner = makeElement()
  const recordingQueryStatus = makeElement()

  const api = createRecording({
    elements: {
      recordingQueryQuestion,
      recordingQueryFrom,
      recordingQueryTo,
      recordingQuerySubmit,
      recordingQueryError,
      recordingQueryAnswer,
      recordingQueryAvailability,
      recordingQueryEstimate,
      recordingQuerySpinner,
      recordingQueryStatus
    },
    jiminy: {
      runRecordingQuery: async () => ({ ok: true, answerText: 'ok' }),
      getRecordingQueryAvailability: async () => ({ available: true }),
      getRecordingQueryEstimate: async () => ({ ok: true, totalDurationMs: 0, totalSessions: 0, totalSegments: 0 })
    },
    getState: () => ({
      currentContextFolderPath: '/tmp',
      currentAlwaysRecordWhenActive: false,
      currentLlmProviderName: 'gemini',
      currentLlmApiKey: 'key'
    })
  })

  api.updateRecordingUI()
  recordingQuerySubmit.handlers.click()

  assert.equal(recordingQueryError.textContent, 'Question is required.')

  global.window = originalWindow
})
