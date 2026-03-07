const path = require('node:path')
const fs = require('node:fs/promises')
const { scanAndRedactContent } = require('../security/rg-redaction')

const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../const')
const { formatLocalTimestamp } = require('../utils/timestamp-utils')

function buildTimestamp (date = new Date()) {
  return formatLocalTimestamp(date)
}

function buildClipboardMirrorFilename (date = new Date()) {
  return `${buildTimestamp(date)}.clipboard.txt`
}

function noop () {}

function getClipboardMirrorDirectory ({ contextFolderPath, sessionId } = {}) {
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

async function saveClipboardMirrorToDirectory ({
  text,
  directory,
  date = new Date(),
  options: {
    onRedactionWarning = noop,
    scanAndRedactContentImpl = scanAndRedactContent
  } = {}
} = {}) {
  if (typeof text !== 'string') {
    throw new Error('Clipboard text is missing or invalid.')
  }
  if (!directory) {
    throw new Error('Clipboard mirror directory is missing.')
  }

  await fs.mkdir(directory, { recursive: true })
  const filename = buildClipboardMirrorFilename(date)
  const fullPath = path.join(directory, filename)
  const redactionResult = await scanAndRedactContentImpl({
    content: text,
    fileType: 'clipboard',
    fileIdentifier: fullPath,
    onRedactionWarning
  })
  if (redactionResult.redactionBypassed) {
    console.warn('Saved clipboard mirror without redaction due to scanner issue', { fullPath })
  } else if (redactionResult.findings > 0) {
    console.log('Redacted clipboard text before save', {
      fullPath,
      findings: redactionResult.findings,
      ruleCounts: redactionResult.ruleCounts
    })
  }
  await fs.writeFile(fullPath, redactionResult.content, 'utf-8')
  return { path: fullPath, filename }
}

module.exports = {
  buildTimestamp,
  buildClipboardMirrorFilename,
  getClipboardMirrorDirectory,
  saveClipboardMirrorToDirectory
}
