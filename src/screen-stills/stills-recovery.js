const fs = require('node:fs')
const path = require('node:path')

const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../const')
const { parseTimestampMs } = require('../utils/timestamp-utils')

/**
 * Scan the stills filesystem and return entries for every .webp capture that
 * has no corresponding .md file in stills-markdown.  These are screenshots
 * that were captured while the SQLite queue was broken and can be re-enqueued
 * for OCR after the database is replaced.
 *
 * @param {{ contextFolderPath: string, logger?: object }} options
 * @returns {Array<{ imagePath: string, sessionId: string, capturedAt: string }>}
 */
const scanOrphanStills = ({ contextFolderPath, logger = console } = {}) => {
  if (!contextFolderPath) return []

  const stillsRoot = path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)
  const markdownRoot = path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME)

  let sessionNames
  try {
    sessionNames = fs.readdirSync(stillsRoot).filter((name) => {
      if (!name.startsWith('session-')) return false
      try {
        return fs.statSync(path.join(stillsRoot, name)).isDirectory()
      } catch (_) {
        return false
      }
    })
  } catch (_) {
    // stills directory doesn't exist yet — nothing to recover
    return []
  }

  const orphans = []

  for (const sessionId of sessionNames) {
    const sessionDir = path.join(stillsRoot, sessionId)
    let files
    try {
      files = fs.readdirSync(sessionDir).filter((f) => f.endsWith('.webp'))
    } catch (e) {
      if (typeof logger.warn === 'function') {
        logger.warn('Could not read stills session directory during orphan scan', {
          sessionDir,
          error: e?.message || String(e)
        })
      }
      continue
    }

    for (const fileName of files) {
      const imagePath = path.join(sessionDir, fileName)
      const baseName = path.basename(fileName, '.webp')
      const markdownPath = path.join(markdownRoot, sessionId, `${baseName}.md`)

      try {
        if (fs.existsSync(markdownPath)) continue
      } catch (_) {
        // If we cannot stat the markdown path, treat the still as orphaned
      }

      let capturedAt
      const parsedMs = parseTimestampMs(baseName)
      if (parsedMs !== null) {
        capturedAt = new Date(parsedMs).toISOString()
      } else {
        try {
          capturedAt = fs.statSync(imagePath).mtime.toISOString()
        } catch (_) {
          capturedAt = new Date().toISOString()
        }
      }

      orphans.push({ imagePath, sessionId, capturedAt })
    }
  }

  return orphans
}

module.exports = { scanOrphanStills }
