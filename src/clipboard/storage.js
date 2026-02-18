const path = require('node:path')
const fs = require('node:fs/promises')

const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME } = require('../const')

function buildTimestamp (date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function buildClipboardMirrorFilename (date = new Date()) {
  return `${buildTimestamp(date)}.clipboard.txt`
}

function getClipboardMirrorDirectory (contextFolderPath, sessionId) {
  if (!contextFolderPath || !sessionId) {
    return null
  }
  return path.join(
    contextFolderPath,
    FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
    STILLS_MARKDOWN_DIR_NAME,
    sessionId
  )
}

async function saveClipboardMirrorToDirectory (text, directory, date = new Date()) {
  if (typeof text !== 'string') {
    throw new Error('Clipboard text is missing or invalid.')
  }
  if (!directory) {
    throw new Error('Clipboard mirror directory is missing.')
  }

  await fs.mkdir(directory, { recursive: true })
  const filename = buildClipboardMirrorFilename(date)
  const fullPath = path.join(directory, filename)
  await fs.writeFile(fullPath, text, 'utf-8')
  return { path: fullPath, filename }
}

module.exports = {
  buildTimestamp,
  buildClipboardMirrorFilename,
  getClipboardMirrorDirectory,
  saveClipboardMirrorToDirectory
}
