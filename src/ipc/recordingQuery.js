const { ipcMain } = require('electron')

const { loadSettings } = require('../settings')
const { runRecordingQuery, estimateRecordingQuery } = require('../recording-query')
const { getRecordingQueryAvailability, GEMINI_UNAVAILABLE_MESSAGE } = require('../recording-query/availability')

let activeRecordingQuery = null

const resolveSettings = () => {
  const settings = loadSettings()
  return {
    contextFolderPath: typeof settings.contextFolderPath === 'string' ? settings.contextFolderPath : '',
    provider: settings?.llm_provider?.provider || '',
    apiKey: settings?.llm_provider?.api_key || ''
  }
}

const getAvailability = () => {
  const { provider, apiKey } = resolveSettings()
  return getRecordingQueryAvailability({ provider, apiKey })
}

const registerRecordingQueryHandlers = () => {
  ipcMain.handle('recordingQuery:availability', () => getAvailability())
  ipcMain.handle('recordingQuery:estimate', (_event, payload = {}) => {
    const { contextFolderPath } = resolveSettings()
    if (!contextFolderPath) {
      return {
        ok: false,
        error: { code: 'CONTEXT_MISSING', message: 'Context folder path is required.' }
      }
    }

    return estimateRecordingQuery({
      contextFolderPath,
      fromDate: payload.fromDate,
      toDate: payload.toDate,
      logger: console
    })
  })

  ipcMain.handle('recordingQuery:run', async (_event, payload = {}) => {
    if (activeRecordingQuery) {
      return {
        ok: false,
        error: { code: 'BUSY', message: 'A query is already running.' }
      }
    }

    const { contextFolderPath, provider, apiKey } = resolveSettings()
    const availability = getRecordingQueryAvailability({ provider, apiKey })
    if (!availability.available) {
      return {
        ok: false,
        error: { code: 'PROVIDER_UNAVAILABLE', message: availability.reason || GEMINI_UNAVAILABLE_MESSAGE }
      }
    }

    if (!contextFolderPath) {
      return {
        ok: false,
        error: { code: 'CONTEXT_MISSING', message: 'Context folder path is required.' }
      }
    }

    const runPayload = {
      contextFolderPath,
      question: payload.question,
      fromDate: payload.fromDate,
      toDate: payload.toDate,
      apiKey,
      logger: console
    }

    try {
      console.info('Recording query IPC started')
      activeRecordingQuery = runRecordingQuery(runPayload)
      return await activeRecordingQuery
    } catch (error) {
      console.error('Recording query IPC failed', error)
      return {
        ok: false,
        error: { code: 'QUERY_FAILED', message: 'Recording query failed.' }
      }
    } finally {
      activeRecordingQuery = null
    }
  })

  console.log('Recording query IPC handlers registered')
}

module.exports = {
  registerRecordingQueryHandlers,
  getAvailability
}
