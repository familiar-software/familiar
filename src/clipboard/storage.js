const path = require('node:path')
const fs = require('node:fs/promises')
const { scanAndRedactContent } = require('../security/rg-redaction')

const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../const')

function buildTimestamp (date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function buildClipboardMirrorFilename (date = new Date()) {
  return `${buildTimestamp(date)}.clipboard.txt`
}

function normalizeImageExtension (extension = 'png') {
  if (typeof extension !== 'string') {
    return 'png'
  }
  const trimmed = extension.trim().toLowerCase()
  if (!trimmed) {
    return 'png'
  }
  const withoutDot = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed
  if (!withoutDot) {
    return 'png'
  }
  return withoutDot.replace(/[^a-z0-9]/g, '') || 'png'
}

function buildClipboardImageMirrorFilename (date = new Date(), extension = 'png') {
  const normalizedExtension = normalizeImageExtension(extension)
  return `${buildTimestamp(date)}.clipboard.${normalizedExtension}`
}

function noop () {}

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

function getClipboardImageMirrorDirectory (contextFolderPath, sessionId) {
  if (!contextFolderPath || !sessionId) {
    return null
  }
  return path.join(
    contextFolderPath,
    FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
    STILLS_DIR_NAME,
    sessionId
  )
}

async function saveClipboardMirrorToDirectory (
  text,
  directory,
  date = new Date(),
  {
    onRedactionWarning = noop,
    scanAndRedactContentImpl = scanAndRedactContent
  } = {}
) {
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

async function saveClipboardImageMirrorToDirectory (
  imageBuffer,
  directory,
  { date = new Date(), extension = 'png' } = {}
) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('Clipboard image is missing or invalid.')
  }
  if (!directory) {
    throw new Error('Clipboard image mirror directory is missing.')
  }

  await fs.mkdir(directory, { recursive: true })
  const filename = buildClipboardImageMirrorFilename(date, extension)
  const fullPath = path.join(directory, filename)
  await fs.writeFile(fullPath, imageBuffer)
  return {
    path: fullPath,
    filename,
    capturedAt: date.toISOString()
  }
}

module.exports = {
  buildTimestamp,
  buildClipboardMirrorFilename,
  buildClipboardImageMirrorFilename,
  getClipboardMirrorDirectory,
  getClipboardImageMirrorDirectory,
  saveClipboardMirrorToDirectory,
  saveClipboardImageMirrorToDirectory
}
