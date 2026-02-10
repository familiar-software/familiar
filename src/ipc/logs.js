const { clipboard, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { resolveSettingsDir } = require('../settings')

const LOG_FILENAME = 'jiminy.log'

function resolveLogFilePath(options = {}) {
  const settingsDir = options.settingsDir
  const logDirectory = path.join(resolveSettingsDir(settingsDir), 'logs')
  return path.join(logDirectory, LOG_FILENAME)
}

/**
 * Registers IPC handlers for log operations.
 */
function registerLogsHandlers(options = {}) {
  const handlerOptions = {
    settingsDir: options.settingsDir
  }

  ipcMain.handle('logs:copyCurrentLogToClipboard', (_event) =>
    handleCopyCurrentLogToClipboard(handlerOptions)
  )
  console.log('Logs IPC handlers registered')
}

async function handleCopyCurrentLogToClipboard(options = {}) {
  const logFilePath = resolveLogFilePath(options)

  try {
    if (!fs.existsSync(logFilePath)) {
      return { ok: false, message: 'Log file not found yet.' }
    }

    const content = fs.readFileSync(logFilePath, 'utf8')
    clipboard.writeText(content || '')

    const bytes = Buffer.byteLength(content || '', 'utf8')
    console.log('Copied current log to clipboard', { logFilePath, bytes })
    return { ok: true, bytes, path: logFilePath }
  } catch (error) {
    console.error('Failed to copy current log to clipboard', {
      logFilePath,
      message: error && error.message ? error.message : 'Unknown error'
    })
    return { ok: false, message: 'Failed to copy log file.' }
  }
}

module.exports = {
  registerLogsHandlers,
  // Exported for unit tests.
  handleCopyCurrentLogToClipboard,
  resolveLogFilePath
}

