const { BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { loadSettings } = require('../settings')
const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DB_FILENAME,
  STILLS_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../const')
const {
  STORAGE_DELETE_WINDOW_PRESETS,
  DEFAULT_STORAGE_DELETE_WINDOW
} = require('../storage/delete-window')

const LEADING_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/
const SESSION_ID_PATTERN = /^session-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/

function resolveDeleteWindow(deleteWindow) {
  const requestedWindow =
    typeof deleteWindow === 'string' &&
    Object.prototype.hasOwnProperty.call(STORAGE_DELETE_WINDOW_PRESETS, deleteWindow)
      ? deleteWindow
      : DEFAULT_STORAGE_DELETE_WINDOW
  return {
    key: requestedWindow,
    ...STORAGE_DELETE_WINDOW_PRESETS[requestedWindow]
  }
}

function toRealPathSafe(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    return null
  }
  try {
    return fs.realpathSync(targetPath)
  } catch (_error) {
    return null
  }
}

function isSymbolicLinkPathSafe(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    return false
  }
  try {
    return fs.lstatSync(targetPath).isSymbolicLink()
  } catch (_error) {
    return false
  }
}

function normalizeAllowedRoots(allowedRoots = []) {
  return allowedRoots
    .filter((root) => !isSymbolicLinkPathSafe(root))
    .map((root) => toRealPathSafe(root))
    .filter(Boolean)
}

function isWithinAnyAllowedRoot(realPath, realAllowedRoots = []) {
  if (!realPath || !Array.isArray(realAllowedRoots) || realAllowedRoots.length === 0) {
    return false
  }
  return realAllowedRoots.some(
    (root) => realPath === root || realPath.startsWith(`${root}${path.sep}`)
  )
}

function parseLeadingTimestampMs(fileName) {
  if (typeof fileName !== 'string' || fileName.length === 0) {
    return null
  }
  const match = fileName.match(LEADING_TIMESTAMP_PATTERN)
  if (!match) {
    return null
  }
  const normalizedIso = match[1].replace(
    /^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    '$1$2:$3:$4.$5Z'
  )
  const parsed = Date.parse(normalizedIso)
  return Number.isFinite(parsed) ? parsed : null
}

function parseSessionTimestampMs(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return null
  }
  const match = sessionId.match(SESSION_ID_PATTERN)
  if (!match) {
    return null
  }
  const normalizedIso = match[1].replace(
    /^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    '$1$2:$3:$4.$5Z'
  )
  const parsed = Date.parse(normalizedIso)
  return Number.isFinite(parsed) ? parsed : null
}

function collectFilesWithinWindow(
  rootPath,
  { startMs, endMs, allowedRoots = [], logger = console }
) {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return []
  }
  if (isSymbolicLinkPathSafe(rootPath)) {
    logger.warn('Refusing to scan symlink storage root', { rootPath })
    return []
  }

  const realAllowedRoots = normalizeAllowedRoots(allowedRoots)
  if (allowedRoots.length > 0 && realAllowedRoots.length === 0) {
    logger.warn('Refusing to scan storage root because no valid allowed roots were provided', {
      rootPath
    })
    return []
  }
  const realRootPath = toRealPathSafe(rootPath)
  if (!realRootPath) {
    return []
  }
  if (realAllowedRoots.length > 0 && !isWithinAnyAllowedRoot(realRootPath, realAllowedRoots)) {
    logger.warn('Refusing to scan storage root outside allowed roots', { rootPath })
    return []
  }

  const selected = []
  const stack = [realRootPath]

  while (stack.length > 0) {
    const current = stack.pop()
    if (realAllowedRoots.length > 0 && !isWithinAnyAllowedRoot(current, realAllowedRoots)) {
      logger.warn('Skipping storage directory outside allowed roots', { current })
      continue
    }

    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (error) {
      logger.warn('Failed to read storage directory while collecting files', {
        current,
        message: error?.message || String(error)
      })
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isSymbolicLink()) {
        logger.warn('Skipping symlink during storage scan', { fullPath })
        continue
      }
      if (entry.isDirectory()) {
        const realDirPath = toRealPathSafe(fullPath)
        if (!realDirPath) {
          continue
        }
        if (realAllowedRoots.length > 0 && !isWithinAnyAllowedRoot(realDirPath, realAllowedRoots)) {
          logger.warn('Skipping nested storage directory outside allowed roots', { fullPath })
          continue
        }
        stack.push(realDirPath)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      const realFilePath = toRealPathSafe(fullPath)
      if (!realFilePath) {
        continue
      }
      if (realAllowedRoots.length > 0 && !isWithinAnyAllowedRoot(realFilePath, realAllowedRoots)) {
        logger.warn('Skipping storage file outside allowed roots', { fullPath })
        continue
      }
      const timestampMs = parseLeadingTimestampMs(entry.name)
      if (timestampMs === null) {
        continue
      }
      if (timestampMs >= startMs && timestampMs <= endMs) {
        selected.push(realFilePath)
      }
    }
  }

  return selected
}

async function deleteFileIfAllowed(
  filePath,
  { allowedRoots = [], deleteFile, logger = console } = {}
) {
  const realAllowedRoots = normalizeAllowedRoots(allowedRoots)
  if (realAllowedRoots.length === 0) {
    return { ok: false, message: 'No allowed roots configured for delete operation.' }
  }
  if (typeof deleteFile !== 'function') {
    return { ok: false, message: 'Delete operation unavailable.' }
  }

  let stats = null
  try {
    stats = fs.lstatSync(filePath)
  } catch (error) {
    return { ok: false, message: error?.message || 'File is not accessible.' }
  }
  if (stats.isSymbolicLink()) {
    return { ok: false, message: 'Refusing to delete symlink.' }
  }

  const realFilePath = toRealPathSafe(filePath)
  if (!realFilePath || !isWithinAnyAllowedRoot(realFilePath, realAllowedRoots)) {
    logger.warn('Refusing to delete file outside allowed roots', { filePath })
    return { ok: false, message: 'Refusing to delete file outside Familiar storage roots.' }
  }

  await deleteFile(realFilePath)
  return { ok: true, path: realFilePath }
}

async function deleteDirectoryIfAllowed(
  dirPath,
  { allowedRoots = [], deleteDirectory, logger = console } = {}
) {
  const realAllowedRoots = normalizeAllowedRoots(allowedRoots)
  if (realAllowedRoots.length === 0) {
    return { ok: false, message: 'No allowed roots configured for delete operation.' }
  }
  if (typeof deleteDirectory !== 'function') {
    return { ok: false, message: 'Delete operation unavailable.' }
  }

  let stats = null
  try {
    stats = fs.lstatSync(dirPath)
  } catch (error) {
    return { ok: false, message: error?.message || 'Directory is not accessible.' }
  }
  if (stats.isSymbolicLink()) {
    return { ok: false, message: 'Refusing to delete symlink.' }
  }
  if (!stats.isDirectory()) {
    return { ok: false, message: 'Path is not a directory.' }
  }

  const realDirPath = toRealPathSafe(dirPath)
  if (!realDirPath || !isWithinAnyAllowedRoot(realDirPath, realAllowedRoots)) {
    logger.warn('Refusing to delete directory outside allowed roots', { dirPath })
    return { ok: false, message: 'Refusing to delete directory outside Familiar storage roots.' }
  }

  await deleteDirectory(realDirPath)
  return { ok: true, path: realDirPath }
}

function resolveNewestSessionId(sessionRoots = [], { allowedRoots = [] } = {}) {
  const realAllowedRoots = normalizeAllowedRoots(allowedRoots)
  let newest = null

  for (const rootPath of sessionRoots) {
    const realRootPath = toRealPathSafe(rootPath)
    if (!realRootPath || !fs.existsSync(realRootPath)) {
      continue
    }
    if (realAllowedRoots.length > 0 && !isWithinAnyAllowedRoot(realRootPath, realAllowedRoots)) {
      continue
    }

    let entries = []
    try {
      entries = fs.readdirSync(realRootPath, { withFileTypes: true })
    } catch (_error) {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue
      }
      const timestampMs = parseSessionTimestampMs(entry.name)
      if (timestampMs === null) {
        continue
      }
      if (!newest || timestampMs > newest.timestampMs) {
        newest = { sessionId: entry.name, timestampMs }
      }
    }
  }

  return newest ? newest.sessionId : null
}

async function deleteEmptySessionDirectories(
  sessionRoots = [],
  {
    allowedRoots = [],
    skipSessionId = null,
    deleteDirectory,
    deleteDirectoryIfAllowedFn,
    logger = console
  } = {}
) {
  const deletedSessionDirs = []
  const failedSessionDirs = []
  const realAllowedRoots = normalizeAllowedRoots(allowedRoots)
  const guardedDirectoryDelete =
    typeof deleteDirectoryIfAllowedFn === 'function'
      ? deleteDirectoryIfAllowedFn
      : deleteDirectoryIfAllowed

  for (const rootPath of sessionRoots) {
    const realRootPath = toRealPathSafe(rootPath)
    if (!realRootPath || !fs.existsSync(realRootPath)) {
      continue
    }
    if (realAllowedRoots.length > 0 && !isWithinAnyAllowedRoot(realRootPath, realAllowedRoots)) {
      logger.warn('Skipping session cleanup root outside allowed roots', { rootPath })
      continue
    }

    let entries = []
    try {
      entries = fs.readdirSync(realRootPath, { withFileTypes: true })
    } catch (error) {
      logger.warn('Failed to read session cleanup root', {
        rootPath: realRootPath,
        message: error?.message || String(error)
      })
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue
      }
      if (parseSessionTimestampMs(entry.name) === null) {
        continue
      }
      if (skipSessionId && entry.name === skipSessionId) {
        continue
      }

      const sessionDirPath = path.join(realRootPath, entry.name)
      const realSessionDirPath = toRealPathSafe(sessionDirPath)
      if (!realSessionDirPath) {
        continue
      }
      if (
        realAllowedRoots.length > 0 &&
        !isWithinAnyAllowedRoot(realSessionDirPath, realAllowedRoots)
      ) {
        logger.warn('Skipping session cleanup directory outside allowed roots', { sessionDirPath })
        continue
      }

      let childEntries = []
      try {
        childEntries = fs.readdirSync(realSessionDirPath)
      } catch (error) {
        failedSessionDirs.push(realSessionDirPath)
        logger.warn('Failed to inspect session directory during cleanup', {
          sessionDirPath: realSessionDirPath,
          message: error?.message || String(error)
        })
        continue
      }
      if (childEntries.length > 0) {
        continue
      }

      try {
        const deleteResult = await guardedDirectoryDelete(realSessionDirPath, {
          allowedRoots: realAllowedRoots,
          deleteDirectory,
          logger
        })
        if (!deleteResult.ok) {
          failedSessionDirs.push(realSessionDirPath)
          continue
        }
        deletedSessionDirs.push(realSessionDirPath)
      } catch (error) {
        failedSessionDirs.push(realSessionDirPath)
        logger.error('Failed to delete empty session directory during storage cleanup', {
          sessionDirPath: realSessionDirPath,
          message: error?.message || String(error)
        })
      }
    }
  }

  return {
    deletedSessionDirs,
    failedSessionDirs
  }
}

function deleteRowsByColumnIn(db, columnName, values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0
  }
  const placeholders = values.map(() => '?').join(', ')
  const query = `DELETE FROM stills_queue WHERE ${columnName} IN (${placeholders})`
  const info = db.prepare(query).run(...values)
  return Number(info?.changes) || 0
}

function pruneQueueRows({
  contextFolderPath,
  stillFiles = [],
  markdownFiles = [],
  logger = console
}) {
  const dbPath = path.join(
    contextFolderPath,
    FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
    STILLS_DB_FILENAME
  )

  if (!fs.existsSync(dbPath)) {
    return { removedQueueRows: 0 }
  }

  let Database = null
  try {
    Database = require('better-sqlite3')
  } catch (error) {
    logger.error('Failed to load better-sqlite3 for queue cleanup', {
      dbPath,
      message: error?.message || String(error)
    })
    return { removedQueueRows: 0 }
  }

  let db = null
  try {
    db = new Database(dbPath)
    const removedByImagePath = deleteRowsByColumnIn(db, 'image_path', stillFiles)
    const removedByMarkdownPath = deleteRowsByColumnIn(db, 'markdown_path', markdownFiles)
    return { removedQueueRows: removedByImagePath + removedByMarkdownPath }
  } catch (error) {
    logger.error('Failed to prune stills queue rows after storage cleanup', {
      dbPath,
      message: error?.message || String(error)
    })
    return { removedQueueRows: 0 }
  } finally {
    if (db) {
      db.close()
    }
  }
}

async function handleDeleteFiles(event, payload = {}, options = {}) {
  const logger = options.logger || console
  const showMessageBox = options.showMessageBox || dialog.showMessageBox.bind(dialog)
  const deleteFile = options.deleteFile || ((targetPath) => fs.promises.unlink(targetPath))
  const deleteDirectory = options.deleteDirectory || ((targetPath) => fs.promises.rmdir(targetPath))
  const settingsLoader = options.settingsLoader || loadSettings
  const collectFiles = options.collectFilesWithinWindow || collectFilesWithinWindow
  const deleteIfAllowed = options.deleteFileIfAllowed || deleteFileIfAllowed
  const deleteEmptySessions =
    options.deleteEmptySessionDirectories || deleteEmptySessionDirectories
  const deleteWindow = resolveDeleteWindow(payload?.deleteWindow)
  const requestedAtMs = Number.isFinite(payload?.requestedAtMs)
    ? Math.floor(payload.requestedAtMs)
    : Date.now()

  const shouldAutoConfirmForE2E =
    process.env.FAMILIAR_E2E === '1' &&
    (process.env.FAMILIAR_E2E_AUTO_CONFIRM_DELETE_FILES === '1' ||
      process.env.FAMILIAR_E2E_AUTO_CONFIRM_DELETE_LAST_30_MIN === '1')
  const confirmResult = shouldAutoConfirmForE2E
    ? { response: 1 }
    : await showMessageBox(BrowserWindow.fromWebContents(event?.sender) || null, {
        type: 'warning',
        buttons: ['Cancel', 'Yes'],
        defaultId: 0,
        cancelId: 0,
        title: `Delete files (${deleteWindow.label})`,
        message: `Are you sure you want to delete files from ${deleteWindow.label}?`,
        detail: 'This includes all captured context and session folders'
      })

  if (confirmResult?.response !== 1) {
    logger.log('Storage cleanup canceled by user', { requestedAtMs })
    return { ok: false, canceled: true, message: 'Canceled.' }
  }

  const settings = settingsLoader()
  const contextFolderPath =
    typeof settings?.contextFolderPath === 'string' ? settings.contextFolderPath : ''

  if (!contextFolderPath) {
    return { ok: false, message: 'Select a context folder first.' }
  }

  const stillsRoot = path.join(
    contextFolderPath,
    FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
    STILLS_DIR_NAME
  )
  const stillsMarkdownRoot = path.join(
    contextFolderPath,
    FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
    STILLS_MARKDOWN_DIR_NAME
  )
  const startMs = deleteWindow.durationMs === null ? 0 : requestedAtMs - deleteWindow.durationMs
  const allowedRoots = [stillsRoot, stillsMarkdownRoot]
  const stillFiles = collectFiles(stillsRoot, {
    startMs,
    endMs: requestedAtMs,
    allowedRoots,
    logger
  })
  const markdownFiles = collectFiles(stillsMarkdownRoot, {
    startMs,
    endMs: requestedAtMs,
    allowedRoots,
    logger
  })
  const candidateFiles = [...stillFiles, ...markdownFiles]

  let deletedCount = 0
  const failedFiles = []

  for (const filePath of candidateFiles) {
    try {
      const deleteResult = await deleteIfAllowed(filePath, { allowedRoots, deleteFile, logger })
      if (!deleteResult.ok) {
        failedFiles.push(filePath)
        continue
      }
      deletedCount += 1
    } catch (error) {
      failedFiles.push(filePath)
      logger.error('Failed to delete file during storage cleanup', {
        filePath,
        message: error?.message || String(error)
      })
    }
  }

  const { removedQueueRows } = pruneQueueRows({
    contextFolderPath,
    stillFiles,
    markdownFiles,
    logger
  })
  const newestSessionId = resolveNewestSessionId([stillsRoot, stillsMarkdownRoot], {
    allowedRoots
  })
  const { deletedSessionDirs, failedSessionDirs } = await deleteEmptySessions(
    [stillsRoot, stillsMarkdownRoot],
    {
      allowedRoots,
      skipSessionId: newestSessionId,
      deleteDirectory,
      logger
    }
  )

  logger.log('Storage cleanup processed delete window', {
    deleteWindow: deleteWindow.key,
    deleteWindowLabel: deleteWindow.label,
    requestedAt: new Date(requestedAtMs).toISOString(),
    windowStart: new Date(startMs).toISOString(),
    windowEnd: new Date(requestedAtMs).toISOString(),
    contextFolderPath,
    stillFilesMatched: stillFiles.length,
    markdownFilesMatched: markdownFiles.length,
    deletedCount,
    failedCount: failedFiles.length,
    removedQueueRows,
    skippedNewestSessionId: newestSessionId,
    removedSessionDirCount: deletedSessionDirs.length,
    failedSessionDirCount: failedSessionDirs.length
  })

  if (failedFiles.length > 0) {
    return {
      ok: false,
      message: `Could not delete all files. Example: ${failedFiles[0]}`
    }
  }

  return {
    ok: true,
    message: `Deleted files from last ${deleteWindow.label}`
  }
}

function registerStorageHandlers() {
  ipcMain.handle('storage:deleteFiles', handleDeleteFiles)
  console.log('Storage IPC handlers registered')
}

module.exports = {
  registerStorageHandlers,
  handleDeleteFiles,
  toRealPathSafe,
  isSymbolicLinkPathSafe,
  normalizeAllowedRoots,
  isWithinAnyAllowedRoot,
  parseLeadingTimestampMs,
  parseSessionTimestampMs,
  resolveDeleteWindow,
  collectFilesWithinWindow,
  deleteFileIfAllowed,
  deleteDirectoryIfAllowed,
  resolveNewestSessionId,
  deleteEmptySessionDirectories,
  pruneQueueRows
}
