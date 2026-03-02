const fs = require('node:fs')
const path = require('node:path')

const { loadSettings } = require('../settings')

const resolveContextFolderPath = ({
  contextFolderPath,
  settingsLoader = loadSettings
} = {}) => {
  const explicitPath = typeof contextFolderPath === 'string' ? contextFolderPath.trim() : ''
  if (explicitPath) {
    return explicitPath
  }

  const settings = settingsLoader()
  const settingsPath = typeof settings?.contextFolderPath === 'string' ? settings.contextFolderPath.trim() : ''
  return settingsPath
}

const validateContextFolderPath = ({ contextFolderPath } = {}) => {
  if (typeof contextFolderPath !== 'string' || contextFolderPath.trim().length === 0) {
    return { ok: false, message: 'Context folder path is required.' }
  }

  const resolvedPath = path.resolve(contextFolderPath)
  try {
    if (!fs.existsSync(resolvedPath)) {
      return { ok: false, message: `Context folder does not exist: ${resolvedPath}` }
    }

    const stats = fs.statSync(resolvedPath)
    if (!stats.isDirectory()) {
      return { ok: false, message: `Context folder is not a directory: ${resolvedPath}` }
    }
  } catch (error) {
    return { ok: false, message: error?.message || 'Failed to read context folder path.' }
  }

  return { ok: true, contextFolderPath: resolvedPath }
}

const resolveWorkspaceDir = ({ contextFolderPath, workspaceDir } = {}) => {
  const explicitWorkspaceDir = typeof workspaceDir === 'string' ? workspaceDir.trim() : ''
  if (explicitWorkspaceDir) {
    return path.resolve(explicitWorkspaceDir)
  }
  return path.dirname(path.resolve(contextFolderPath))
}

module.exports = {
  resolveContextFolderPath,
  validateContextFolderPath,
  resolveWorkspaceDir
}
