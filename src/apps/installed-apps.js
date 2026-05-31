const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const { normalizeAppString } = require('../utils/strings')

const execFileAsync = promisify(execFile)

const E2E_INSTALLED_APPS_ENV_KEY = 'FAMILIAR_E2E_INSTALLED_APPS_JSON'
const APPLICATIONS_DIR_SUFFIX = '.app'
const DEFAULT_SCAN_ROOTS = Object.freeze([
  '/Applications',
  '/System/Applications',
  path.join(os.homedir(), 'Applications')
])
const MAX_DISCOVERED_APP_PATHS = 2000

const normalizeInstalledApp = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const bundleId = normalizeAppString(value.bundleId, null)
  const name = normalizeAppString(value.name, null)
  const appPath = normalizeAppString(value.appPath, null)
  const iconPath = normalizeAppString(value.iconPath, null)
  if (!bundleId && !name) {
    return null
  }

  return {
    bundleId,
    name,
    appPath,
    iconPath
  }
}

const buildInstalledAppKey = (value) => {
  const normalized = normalizeInstalledApp(value)
  if (!normalized) {
    return ''
  }
  if (normalized.bundleId) {
    return `bundle:${normalized.bundleId}`
  }
  return `name:${normalized.name.toLowerCase()}`
}

const normalizeInstalledApps = (value) => {
  const source = Array.isArray(value) ? value : []
  const seen = new Set()
  const apps = []

  for (const entry of source) {
    const normalized = normalizeInstalledApp(entry)
    if (!normalized) {
      continue
    }
    const key = buildInstalledAppKey(normalized)
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    apps.push(normalized)
  }

  return apps.sort((left, right) => {
    const leftLabel = (left.name || left.bundleId || '').toLowerCase()
    const rightLabel = (right.name || right.bundleId || '').toLowerCase()
    return leftLabel.localeCompare(rightLabel)
  })
}

const resolveIconCandidatePaths = ({ appPath, iconName } = {}) => {
  const normalizedAppPath = normalizeAppString(appPath, null)
  const normalizedIconName = normalizeAppString(iconName, null)
  if (!normalizedAppPath || !normalizedIconName) {
    return []
  }

  const resourcesDir = path.join(normalizedAppPath, 'Contents', 'Resources')
  const extensionIndex = normalizedIconName.lastIndexOf('.')
  const baseName = extensionIndex > 0 ? normalizedIconName.slice(0, extensionIndex) : normalizedIconName

  return [
    path.join(resourcesDir, normalizedIconName),
    path.join(resourcesDir, `${baseName}.icns`),
    path.join(resourcesDir, `${baseName}.png`)
  ]
}

const resolveDeclaredIconPath = async ({ appPath, infoPlist = {} } = {}) => {
  const iconNames = [
    infoPlist?.CFBundleIconFile,
    infoPlist?.CFBundleIconName
  ]

  for (const iconName of iconNames) {
    const candidates = resolveIconCandidatePaths({ appPath, iconName })
    for (const candidatePath of candidates) {
      if (await pathExists(candidatePath)) {
        return candidatePath
      }
    }
  }

  return null
}

const readInstalledAppsOverride = ({ logger = console } = {}) => {
  const raw = process.env[E2E_INSTALLED_APPS_ENV_KEY]
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null
  }

  try {
    return normalizeInstalledApps(JSON.parse(raw))
  } catch (error) {
    logger.warn('Ignoring invalid installed apps override JSON', {
      error: error?.message || String(error)
    })
    return []
  }
}

const pathExists = async (value) => {
  try {
    await fs.promises.access(value, fs.constants.R_OK)
    return true
  } catch (_error) {
    return false
  }
}

const toPngDataUrl = (fileBuffer) => `data:image/png;base64,${fileBuffer.toString('base64')}`

const readIconPathDataUrl = async ({ iconPath, logger = console } = {}) => {
  const normalizedIconPath = normalizeAppString(iconPath, null)
  if (!normalizedIconPath || !(await pathExists(normalizedIconPath))) {
    return null
  }

  const lowerCasePath = normalizedIconPath.toLowerCase()
  try {
    if (lowerCasePath.endsWith('.png')) {
      const fileBuffer = await fs.promises.readFile(normalizedIconPath)
      return toPngDataUrl(fileBuffer)
    }

    if (lowerCasePath.endsWith('.icns')) {
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'familiar-app-icon-'))
      const outputPath = path.join(tempDir, 'icon.png')
      try {
        await execFileAsync('sips', ['-s', 'format', 'png', normalizedIconPath, '--out', outputPath], {
          encoding: 'utf8'
        })
        const fileBuffer = await fs.promises.readFile(outputPath)
        return toPngDataUrl(fileBuffer)
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
      }
    }
  } catch (error) {
    logger.warn('Failed to convert installed app icon path', {
      iconPath: normalizedIconPath,
      error: error?.message || String(error)
    })
  }

  return null
}

const collectAppBundlePaths = async ({ roots = DEFAULT_SCAN_ROOTS, logger = console } = {}) => {
  const queue = []
  const discovered = []

  for (const root of roots) {
    if (!root || !(await pathExists(root))) {
      continue
    }
    queue.push(root)
  }

  while (queue.length > 0 && discovered.length < MAX_DISCOVERED_APP_PATHS) {
    const current = queue.shift()
    let entries = []

    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true })
    } catch (error) {
      logger.warn('Failed to scan applications directory', {
        current,
        error: error?.message || String(error)
      })
      continue
    }

    for (const entry of entries) {
      if (!entry || !entry.name) {
        continue
      }

      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory() && entry.name.endsWith(APPLICATIONS_DIR_SUFFIX)) {
        discovered.push(entryPath)
        continue
      }

      if (entry.isDirectory()) {
        queue.push(entryPath)
      }
    }
  }

  return discovered
}

const readPlistJson = async ({ infoPlistPath } = {}) => {
  const { stdout } = await execFileAsync('plutil', ['-convert', 'json', '-o', '-', infoPlistPath], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 5
  })
  return JSON.parse(stdout)
}

const readRawPlistValue = async ({ infoPlistPath, key } = {}) => {
  try {
    const { stdout } = await execFileAsync('plutil', [
      '-extract',
      key,
      'raw',
      '-o',
      '-',
      infoPlistPath
    ], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    })
    return normalizeAppString(stdout, null)
  } catch (_error) {
    return null
  }
}

const readPlistRawFields = async ({ infoPlistPath } = {}) => ({
  CFBundleIdentifier: await readRawPlistValue({ infoPlistPath, key: 'CFBundleIdentifier' }),
  CFBundleDisplayName: await readRawPlistValue({ infoPlistPath, key: 'CFBundleDisplayName' }),
  CFBundleName: await readRawPlistValue({ infoPlistPath, key: 'CFBundleName' }),
  CFBundleIconFile: await readRawPlistValue({ infoPlistPath, key: 'CFBundleIconFile' }),
  CFBundleIconName: await readRawPlistValue({ infoPlistPath, key: 'CFBundleIconName' })
})

const hasReadablePlistIdentity = (infoPlist = {}) =>
  Boolean(infoPlist.CFBundleIdentifier || infoPlist.CFBundleDisplayName || infoPlist.CFBundleName)

const buildAppFromInfoPlist = async ({ appPath, infoPlist } = {}) => {
  const parsed = infoPlist || {}
  const iconPath = await resolveDeclaredIconPath({ appPath, infoPlist: parsed })
  return normalizeInstalledApp({
    bundleId: parsed?.CFBundleIdentifier,
    name: parsed?.CFBundleDisplayName || parsed?.CFBundleName || path.basename(appPath, '.app'),
    appPath,
    iconPath
  })
}

const readAppInfoPlist = async ({ appPath } = {}) => {
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist')
  try {
    const infoPlist = await readPlistJson({ infoPlistPath })
    return await buildAppFromInfoPlist({ appPath, infoPlist })
  } catch (error) {
    const infoPlist = await readPlistRawFields({ infoPlistPath })
    if (hasReadablePlistIdentity(infoPlist)) {
      return await buildAppFromInfoPlist({ appPath, infoPlist })
    }
    throw error
  }
}

const getInstalledAppIconDataUrl = async ({
  appPath,
  iconPath,
  getFileIcon,
  logger = console
} = {}) => {
  const normalizedAppPath = normalizeAppString(appPath, null)
  const normalizedIconPath = normalizeAppString(iconPath, null)
  if (!normalizedAppPath) {
    return null
  }

  try {
    const directDataUrl = await readIconPathDataUrl({
      iconPath: normalizedIconPath,
      logger
    })
    if (directDataUrl) {
      return directDataUrl
    }

    if (typeof getFileIcon !== 'function') {
      throw new Error('getFileIcon is required')
    }

    const icon = await getFileIcon(normalizedAppPath, { size: 'normal' })
    if (!icon || typeof icon.toDataURL !== 'function' || icon.isEmpty?.() === true) {
      return null
    }

    const dataUrl = icon.toDataURL()
    return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')
      ? dataUrl
      : null
  } catch (error) {
    logger.warn('Failed to resolve installed app icon', {
      appPath: normalizedAppPath,
      iconPath: normalizedIconPath,
      error: error?.message || String(error)
    })
    return null
  }
}

const listInstalledApps = async ({ logger = console } = {}) => {
  const override = readInstalledAppsOverride({ logger })
  if (override !== null) {
    return override
  }

  if (process.platform !== 'darwin') {
    return []
  }

  const appPaths = await collectAppBundlePaths({ logger })
  const apps = []
  for (const appPath of appPaths) {
    try {
      const app = await readAppInfoPlist({ appPath })
      if (app) {
        apps.push(app)
      }
    } catch (error) {
      logger.warn('Failed to read app bundle metadata', {
        appPath,
        error: error?.message || String(error)
      })
    }
  }

  return normalizeInstalledApps(apps)
}

module.exports = {
  E2E_INSTALLED_APPS_ENV_KEY,
  DEFAULT_SCAN_ROOTS,
  normalizeInstalledApp,
  normalizeInstalledApps,
  readIconPathDataUrl,
  resolveDeclaredIconPath,
  readInstalledAppsOverride,
  collectAppBundlePaths,
  readAppInfoPlist,
  listInstalledApps,
  getInstalledAppIconDataUrl
}
