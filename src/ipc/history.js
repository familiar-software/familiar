const { ipcMain, shell, clipboard } = require('electron')

const { loadSettings } = require('../settings')
const { listFlows, listEvents, getRecentFlows, exportFlowEvents } = require('../history')

const resolveContextFolderPath = () => {
  const settings = loadSettings()
  return typeof settings.contextFolderPath === 'string' ? settings.contextFolderPath : ''
}

const normalizeLimit = (limit, fallback) => {
  const parsed = Number(limit)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 200)
  }
  return fallback
}

const normalizeOffset = (offset) => {
  const parsed = Number(offset)
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed
  }
  return 0
}

function registerHistoryHandlers () {
  ipcMain.handle('history:listFlows', (_event, options = {}) => {
    try {
      const contextFolderPath = resolveContextFolderPath()
      const limit = normalizeLimit(options.limit, 50)
      const offset = normalizeOffset(options.offset)
      return listFlows({ contextFolderPath, limit, offset })
    } catch (error) {
      console.error('Failed to list history flows', error)
      return []
    }
  })

  ipcMain.handle('history:listEvents', (_event, flowId) => {
    try {
      const contextFolderPath = resolveContextFolderPath()
      return listEvents({ contextFolderPath, flowId })
    } catch (error) {
      console.error('Failed to list history events', error)
      return []
    }
  })

  ipcMain.handle('history:getRecentFlows', (_event, limit) => {
    try {
      const contextFolderPath = resolveContextFolderPath()
      return getRecentFlows({ contextFolderPath, limit: normalizeLimit(limit, 3) })
    } catch (error) {
      console.error('Failed to list recent history flows', error)
      return []
    }
  })

  ipcMain.handle('history:openInFolder', (_event, targetPath) => {
    if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
      return { ok: false, message: 'Missing file path.' }
    }

    try {
      shell.showItemInFolder(targetPath)
      return { ok: true }
    } catch (error) {
      console.error('Failed to open item in folder', { targetPath, error })
      return { ok: false, message: 'Failed to open item in folder.' }
    }
  })

  ipcMain.handle('history:exportFlow', (_event, flowId) => {
    try {
      const contextFolderPath = resolveContextFolderPath()
      const result = exportFlowEvents({ contextFolderPath, flowId })
      if (!result || result.ok === false) {
        return { ok: false, message: result?.message || 'Failed to export history.' }
      }
      if (typeof result.path !== 'string' || result.path.trim().length === 0) {
        return { ok: false, message: 'Export path missing.' }
      }
      clipboard.writeText(result.path)
      return { ok: true, path: result.path, eventsCount: result.eventsCount }
    } catch (error) {
      console.error('Failed to export history flow', { flowId, error })
      return { ok: false, message: 'Failed to export history flow.' }
    }
  })

  console.log('History IPC handlers registered')
}

module.exports = {
  registerHistoryHandlers
}
