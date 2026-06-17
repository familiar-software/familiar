const { createAwakeLock } = require('../power/awake-lock')
const { createMeetingRecordingController } = require('./controller')

const EMPTY_STATUS = Object.freeze({
  state: 'idle',
  isPrewarming: false,
  isStarting: false,
  isRecording: false,
  awakeLockActive: false,
  sessionId: '',
  transcriptMarkdownPath: '',
  error: ''
})

function createMeetingRecordingMainProcess (options = {}) {
  const logger = options.logger || console
  const loadSettings = options.loadSettings || (() => ({}))
  const getPreferredSessionId = options.getPreferredSessionId || (() => '')
  const getSettingsWindow = options.getSettingsWindow || (() => null)
  const refreshTrayIcon = options.refreshTrayIcon || (() => {})
  const refreshTrayMenu = options.refreshTrayMenu || (() => {})
  const showToast = options.showToast || (() => {})
  const powerSaveBlocker = options.powerSaveBlocker

  let controller = null

  function getStatus () {
    return controller?.getStatus?.() || { ...EMPTY_STATUS }
  }

  function notifyStateChanged () {
    const settingsWindow = getSettingsWindow()
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('settings:meetingRecordingStateChanged', {
        ok: true,
        ...getStatus()
      })
    }
    refreshTrayMenu()
    refreshTrayIcon()
  }

  function handleError ({ message } = {}) {
    if (!message) {
      return
    }
    logger.warn('Meeting recording issue', { message })
    showToast({
      title: 'Meeting recording issue',
      body: message,
      type: 'warning',
      size: 'large'
    })
  }

  function initialize () {
    if (controller) {
      return
    }
    controller = createMeetingRecordingController({
      logger,
      awakeLock: createAwakeLock({ powerSaveBlocker, logger }),
      onError: handleError,
      onStateChanged: notifyStateChanged,
      getContextFolderPath: () => loadSettings()?.contextFolderPath || '',
      getPreferredSessionId
    })
    void prewarm()
  }

  async function prewarm () {
    if (!controller) {
      return { ok: false, message: 'Meeting recording controller unavailable.' }
    }
    try {
      return await controller.prewarm()
    } catch (error) {
      const message = error?.message || 'Failed to prewarm meeting recording.'
      logger.warn('Failed to prewarm meeting recording', { message })
      return { ok: false, message, status: getStatus() }
    }
  }

  async function start () {
    if (!controller) {
      return { ok: false, message: 'Meeting recording controller unavailable.' }
    }
    try {
      return await controller.start()
    } catch (error) {
      const message = error?.message || 'Failed to start meeting recording.'
      logger.error('Failed to start meeting recording', error)
      handleError({ message })
      return { ok: false, message, status: getStatus() }
    }
  }

  async function stop ({ reason = 'manual-stop' } = {}) {
    if (!controller) {
      return { ok: false, message: 'Meeting recording controller unavailable.' }
    }
    try {
      return await controller.stop({ reason })
    } catch (error) {
      const message = error?.message || 'Failed to stop meeting recording.'
      logger.error('Failed to stop meeting recording', error)
      handleError({ message })
      return { ok: false, message, status: getStatus() }
    }
  }

  async function toggle () {
    const result = getStatus().isRecording
      ? await stop({ reason: 'tray' })
      : await start()
    notifyStateChanged()
    return {
      ...result,
      status: getStatus()
    }
  }

  async function shutdown (reason = 'quit') {
    if (!controller) {
      return { ok: true, status: getStatus(), skipped: true }
    }
    return controller.shutdown(reason)
  }

  return {
    getStatus,
    initialize,
    prewarm,
    shutdown,
    start,
    stop,
    toggle
  }
}

module.exports = {
  EMPTY_STATUS,
  createMeetingRecordingMainProcess,
  registerMeetingRecordingIpcHandlers
}

function registerMeetingRecordingIpcHandlers ({
  getMeetingRecordingMainProcess,
  ipcMain,
  isE2E
} = {}) {
  const resolveProcess = () => getMeetingRecordingMainProcess?.() || null
  const getStatus = () => resolveProcess()?.getStatus?.() || { ...EMPTY_STATUS }

  ipcMain.handle('meetingRecording:getStatus', () => ({
    ok: true,
    ...getStatus()
  }))

  ipcMain.handle('meetingRecording:start', async () => {
    const mainProcess = resolveProcess()
    const result = mainProcess
      ? await mainProcess.start()
      : { ok: false, message: 'Meeting recording controller unavailable.' }
    return { ...result, status: getStatus() }
  })

  ipcMain.handle('meetingRecording:stop', async () => {
    const mainProcess = resolveProcess()
    const result = mainProcess
      ? await mainProcess.stop({ reason: 'ipc' })
      : { ok: false, message: 'Meeting recording controller unavailable.' }
    return { ...result, status: getStatus() }
  })

  ipcMain.handle('e2e:tray:clickMeetingRecordingAction', async () => {
    if (!isE2E) {
      return { ok: false, message: 'Tray E2E action is only available in E2E mode.' }
    }
    const mainProcess = resolveProcess()
    const actionResult = mainProcess
      ? await mainProcess.toggle()
      : { ok: false, message: 'Meeting recording controller unavailable.' }
    return {
      ok: actionResult?.ok !== false,
      actionResult,
      status: getStatus()
    }
  })
}
