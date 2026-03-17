const { ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const { loadSettings } = require('../settings')
const { validateWritableDirectoryPath } = require('../settings')
const { resolveHeartbeatTopicFolderPath } = require('../heartbeats/output-folder-path')

const findHeartbeatById = (heartbeatId) => {
  const settings = loadSettings() || {}
  const items = settings?.heartbeats && Array.isArray(settings.heartbeats.items)
    ? settings.heartbeats.items
    : []
  return items.find((entry) => entry?.id === heartbeatId) || null
}

const resolveHeartbeatOutputFolderPath = ({ heartbeatId } = {}) => {
  const settings = loadSettings() || {}
  const target = findHeartbeatById(heartbeatId)
  if (!target) {
    return { ok: false, message: 'Heartbeat not found.' }
  }

  const topicFolder = resolveHeartbeatTopicFolderPath({
    heartbeat: target,
    contextFolderPath: settings?.contextFolderPath
  })
  if (!topicFolder.path) {
    return { ok: false, message: 'Context folder is not set.' }
  }

  if (topicFolder.source === 'custom') {
    const validation = validateWritableDirectoryPath(target.outputFolderPath, {
      requiredMessage: 'Output folder is required.'
    })
    if (!validation.ok) {
      return { ok: false, message: validation.message }
    }
  }

  return {
    ok: true,
    path: topicFolder.path
  }
}

const handleOpenHeartbeatOutputFolder = async (_event, payload = {}) => {
  try {
    const folder = resolveHeartbeatOutputFolderPath({ heartbeatId: payload?.heartbeatId })
    if (!folder.ok) {
      return folder
    }
    try {
      fs.mkdirSync(folder.path, { recursive: true })
    } catch (error) {
      console.error('Failed to ensure heartbeat output folder exists', {
        path: folder.path,
        message: error?.message || String(error)
      })
      return { ok: false, message: 'Unable to create heartbeat output folder.' }
    }

    const openResult = await shell.openPath(folder.path)
    if (openResult) {
      console.error('Failed to open heartbeat output folder', {
        path: folder.path,
        message: openResult
      })
      return { ok: false, message: 'Failed to open heartbeat output folder.' }
    }

    console.log('Opened heartbeat output folder', { path: folder.path })
    return { ok: true }
  } catch (error) {
    console.error('Failed to open heartbeat output folder', error)
    return { ok: false, message: 'Failed to open heartbeat output folder.' }
  }
}

function registerHeartbeatsHandlers({ runHeartbeatNow } = {}) {
  ipcMain.handle('heartbeats:openOutputFolder', handleOpenHeartbeatOutputFolder)
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
