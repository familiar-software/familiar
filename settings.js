const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const SETTINGS_DIR_NAME = '.jiminy'
const SETTINGS_FILE_NAME = 'settings.json'

const resolveSettingsDir = (settingsDir) => (
  settingsDir || process.env.JIMINY_SETTINGS_DIR || path.join(os.homedir(), SETTINGS_DIR_NAME)
)

const resolveSettingsPath = (options = {}) => (
  path.join(resolveSettingsDir(options.settingsDir), SETTINGS_FILE_NAME)
)

const loadSettings = (options = {}) => {
  const settingsPath = resolveSettingsPath(options)

  try {
    if (!fs.existsSync(settingsPath)) {
      return {}
    }

    const raw = fs.readFileSync(settingsPath, 'utf-8')
    if (!raw.trim()) {
      return {}
    }

    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') {
      return {}
    }

    return data
  } catch (error) {
    console.error('Failed to load settings', error)
    return {}
  }
}

const saveSettings = (settings, options = {}) => {
  const settingsDir = resolveSettingsDir(options.settingsDir)
  const settingsPath = path.join(settingsDir, SETTINGS_FILE_NAME)

  fs.mkdirSync(settingsDir, { recursive: true })
  const payload = { contextFolderPath: settings.contextFolderPath || '' }
  fs.writeFileSync(settingsPath, JSON.stringify(payload, null, 2), 'utf-8')

  return settingsPath
}

const validateContextFolderPath = (contextFolderPath) => {
  if (typeof contextFolderPath !== 'string' || contextFolderPath.trim().length === 0) {
    return { ok: false, message: 'Context Folder Path is required.' }
  }

  const resolvedPath = path.resolve(contextFolderPath)

  try {
    if (!fs.existsSync(resolvedPath)) {
      return { ok: false, message: 'Selected path does not exist.' }
    }

    const stats = fs.statSync(resolvedPath)
    if (!stats.isDirectory()) {
      return { ok: false, message: 'Selected path is not a directory.' }
    }

    fs.accessSync(resolvedPath, fs.constants.R_OK | fs.constants.W_OK)
    return { ok: true, path: resolvedPath }
  } catch (error) {
    return { ok: false, message: 'Selected path is not readable or writable.' }
  }
}

module.exports = {
  loadSettings,
  saveSettings,
  validateContextFolderPath
}
