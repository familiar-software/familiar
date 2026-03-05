const { ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const { loadSettings } = require('../settings')
const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, HEARTBEATS_DIR_NAME } = require('../const')

const resolveHeartbeatsFolderPath = () => {
  const settings = loadSettings() || {}
  const contextFolderPath = typeof settings.contextFolderPath === 'string' ? settings.contextFolderPath.trim() : ''
  if (!contextFolderPath) {
    return { ok: false, message: 'Context folder is not set.' }
  }
  const heartbeatsFolderPath = path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, HEARTBEATS_DIR_NAME)
  return { ok: true, path: heartbeatsFolderPath }
}

const handleOpenHeartbeatsFolder = async () => {
  try {
    const folder = resolveHeartbeatsFolderPath()
    if (!folder.ok) {
      return folder
    }
    try {
      fs.mkdirSync(folder.path, { recursive: true })
    } catch (error) {
      console.error('Failed to ensure heartbeats folder exists', {
        path: folder.path,
        message: error?.message || String(error)
      })
      return { ok: false, message: 'Unable to create heartbeats folder.' }
    }

    const openResult = await shell.openPath(folder.path)
    if (openResult) {
      console.error('Failed to open heartbeats folder', {
        path: folder.path,
        message: openResult
      })
      return { ok: false, message: 'Failed to open heartbeats folder.' }
    }

    console.log('Opened heartbeats folder', { path: folder.path })
    return { ok: true }
  } catch (error) {
    console.error('Failed to open heartbeats folder', error)
    return { ok: false, message: 'Failed to open heartbeats folder.' }
  }
}

function registerHeartbeatsHandlers({ runHeartbeatNow } = {}) {
  ipcMain.handle('heartbeats:openFolder', handleOpenHeartbeatsFolder)
  ipcMain.handle('heartbeats:runNow', async (_event, payload = {}) => {
    if (typeof runHeartbeatNow !== 'function') {
      return { ok: false, message: 'Heartbeat scheduler is unavailable.' }
    }
    return runHeartbeatNow(payload)
  })
  console.log('Heartbeats IPC handlers registered')
}

module.exports = {
  registerHeartbeatsHandlers
}
