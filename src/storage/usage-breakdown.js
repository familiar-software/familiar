const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../const')

function parseDuKilobytes(output) {
  if (typeof output !== 'string') {
    return 0
  }
  const firstField = output.trim().split(/\s+/)[0]
  const kilobytes = Number.parseInt(firstField, 10)
  if (!Number.isFinite(kilobytes) || kilobytes < 0) {
    return 0
  }
  return kilobytes
}

function getDuSizeBytes({
  targetPath,
  options: { logger = console, execFile = execFileSync } = {}
} = {}) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return 0
  }

  let duOutput = ''
  try {
    duOutput = execFile('du', ['-skA', targetPath], { encoding: 'utf8' })
  } catch (error) {
    logger.warn('du -skA failed; falling back to du -sk', {
      targetPath,
      message: error?.message || String(error)
    })
    try {
      duOutput = execFile('du', ['-sk', targetPath], { encoding: 'utf8' })
    } catch (fallbackError) {
      logger.error('du size lookup failed', {
        targetPath,
        message: fallbackError?.message || String(fallbackError)
      })
      return 0
    }
  }

  const kilobytes = parseDuKilobytes(duOutput)
  return kilobytes * 1024
}

function getStorageUsageBreakdown({ contextFolderPath, logger = console, execFile } = {}) {
  if (typeof contextFolderPath !== 'string' || contextFolderPath.trim().length === 0) {
    return {
      totalBytes: 0,
      screenshotsBytes: 0,
      steelsMarkdownBytes: 0,
      systemBytes: 0
    }
  }

  const familiarRoot = path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME)
  const stillsRoot = path.join(familiarRoot, STILLS_DIR_NAME)
  const stillsMarkdownRoot = path.join(familiarRoot, STILLS_MARKDOWN_DIR_NAME)

  const totalBytes = getDuSizeBytes({ targetPath: familiarRoot, options: { logger, execFile } })
  const screenshotsBytes = getDuSizeBytes({ targetPath: stillsRoot, options: { logger, execFile } })
  const steelsMarkdownBytes = getDuSizeBytes({
    targetPath: stillsMarkdownRoot,
    options: { logger, execFile }
  })
  const systemBytes = Math.max(0, totalBytes - screenshotsBytes - steelsMarkdownBytes)

  logger.log('Calculated storage usage breakdown via du', {
    contextFolderPath,
    totalBytes,
    screenshotsBytes,
    steelsMarkdownBytes,
    systemBytes
  })

  return {
    totalBytes,
    screenshotsBytes,
    steelsMarkdownBytes,
    systemBytes
  }
}

module.exports = {
  parseDuKilobytes,
  getDuSizeBytes,
  getStorageUsageBreakdown
}
