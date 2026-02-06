const fs = require('node:fs')
const path = require('node:path')
const util = require('node:util')
const { resolveSettingsDir } = require('./settings')

const DEFAULT_MAX_LOG_SIZE_BYTES = 1024 * 1024
const MAX_LOG_SIZE_BYTES = (() => {
  const envValue = Number(process.env.JIMINY_LOG_MAX_BYTES)
  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue
  }
  return DEFAULT_MAX_LOG_SIZE_BYTES
})()
const LOG_FILENAME = 'jiminy.log'
const LOG_BACKUP_FILENAME = 'jiminy.log.1'

let initialized = false

const reportLoggerError = (message, error) => {
  try {
    const details = error && error.message ? `: ${error.message}` : ''
    const line = `[jiminy logger] ${message}${details}\n`
    process.stderr.write(line)
  } catch (_error) {
    // Swallow to avoid cascading failures if stderr is unavailable.
  }
}

const ensureDirectory = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true })
}

const rotateIfNeeded = (logFilePath, backupFilePath) => {
  try {
    const stats = fs.statSync(logFilePath)
    if (stats.size < MAX_LOG_SIZE_BYTES) {
      return
    }

    if (fs.existsSync(backupFilePath)) {
      fs.unlinkSync(backupFilePath)
    }

    fs.renameSync(logFilePath, backupFilePath)
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      reportLoggerError('Failed to rotate log file', error)
    }
  }
}

const createLogger = () => {
  const logDirectory = path.join(resolveSettingsDir(), 'logs')
  const logFilePath = path.join(logDirectory, LOG_FILENAME)
  const backupFilePath = path.join(logDirectory, LOG_BACKUP_FILENAME)

  const writeLine = (level, args) => {
    try {
      ensureDirectory(logDirectory)
      rotateIfNeeded(logFilePath, backupFilePath)
      const message = util.format(...args)
      const line = `${new Date().toISOString()} [${level}] ${message}\n`
      fs.appendFileSync(logFilePath, line, 'utf8')
    } catch (error) {
      reportLoggerError('Failed to write log line', error)
    }
  }

  return { writeLine }
}

const initLogging = () => {
  if (initialized) {
    return
  }

  initialized = true

  const { writeLine } = createLogger()
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  }

  const wrap = (level, original) => (...args) => {
    writeLine(level, args)
    original(...args)
  }

  console.log = wrap('INFO', originalConsole.log)
  console.info = wrap('INFO', originalConsole.info)
  console.warn = wrap('WARN', originalConsole.warn)
  console.error = wrap('ERROR', originalConsole.error)
}

module.exports = {
  initLogging
}
