const fs = require('node:fs')
const path = require('node:path')

const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME } = require('../const')
const { createStillsQueue, resolveDbPath } = require('./stills-queue')

const DB_SIDECAR_SUFFIXES = ['', '-wal', '-shm']
const CORRUPT_SQLITE_CODES = new Set(['SQLITE_CORRUPT', 'SQLITE_NOTADB'])

const resolveArchiveRoot = (contextFolderPath) =>
  path.join(
    contextFolderPath,
    FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
    'archive'
  )

const formatArchiveTimestamp = (date = new Date()) =>
  date.toISOString().replace(/[:.]/g, '-')

const createUniqueArchiveDir = (contextFolderPath) => {
  const archiveRoot = resolveArchiveRoot(contextFolderPath)
  const baseName = `stills-db-corruption-${formatArchiveTimestamp()}`
  fs.mkdirSync(archiveRoot, { recursive: true })

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const dirName = attempt === 1 ? baseName : `${baseName}-${attempt}`
    const archiveDir = path.join(archiveRoot, dirName)
    try {
      fs.mkdirSync(archiveDir)
      return archiveDir
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error
      }
    }
  }

  throw new Error(`Unable to create a unique stills DB archive directory under ${archiveRoot}.`)
}

const archiveDbFiles = ({ contextFolderPath, dbPath }) => {
  const archiveDir = createUniqueArchiveDir(contextFolderPath)
  const movedFiles = []

  for (const suffix of DB_SIDECAR_SUFFIXES) {
    const sourcePath = `${dbPath}${suffix}`
    if (!fs.existsSync(sourcePath)) {
      continue
    }
    const targetPath = path.join(archiveDir, path.basename(sourcePath))
    fs.renameSync(sourcePath, targetPath)
    movedFiles.push({ sourcePath, targetPath })
  }

  return { archiveDir, movedFiles }
}

const isSqliteCorruptError = (error) => {
  if (!error) {
    return false
  }
  if (CORRUPT_SQLITE_CODES.has(error.code)) {
    return true
  }
  const message = typeof error.message === 'string' ? error.message : String(error)
  return (
    message.includes('database disk image is malformed') ||
    message.includes('file is not a database')
  )
}

const recreateStillsQueueDb = ({
  contextFolderPath,
  logger = console,
  createQueueImpl = createStillsQueue
} = {}) => {
  if (!contextFolderPath) {
    throw new Error('Context folder path is required to recreate stills queue database.')
  }

  const dbPath = resolveDbPath(contextFolderPath)
  const archiveResult = archiveDbFiles({ contextFolderPath, dbPath })
  const queue = createQueueImpl({ contextFolderPath, logger })
  queue.close()

  const logRecreation = typeof logger.warn === 'function' ? logger.warn : logger.log
  if (typeof logRecreation === 'function') {
    logRecreation.call(logger, 'Recreated stills queue database', {
      dbPath,
      archiveDir: archiveResult.archiveDir,
      movedFiles: archiveResult.movedFiles.length
    })
  }

  return {
    dbPath,
    ...archiveResult
  }
}

module.exports = {
  archiveDbFiles,
  isSqliteCorruptError,
  recreateStillsQueueDb
}
