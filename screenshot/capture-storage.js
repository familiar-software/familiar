const path = require('node:path')
const fs = require('node:fs/promises')
const { CAPTURE_FILENAME_PREFIX, CAPTURES_DIR_NAME } = require('../const')

function buildCaptureFilename (date = new Date()) {
  const pad = (value, size = 2) => String(value).padStart(size, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())
  const second = pad(date.getSeconds())
  const ms = pad(date.getMilliseconds(), 3)

  return `${CAPTURE_FILENAME_PREFIX} ${year}-${month}-${day}_${hour}-${minute}-${second}-${ms}.png`
}

function getCaptureDirectory (contextFolderPath) {
  if (!contextFolderPath) {
    return null
  }

  return path.join(contextFolderPath, CAPTURES_DIR_NAME)
}

async function savePngToDirectory (buffer, directory, date = new Date()) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Capture buffer is missing or invalid.')
  }

  if (!directory) {
    throw new Error('Capture directory is missing.')
  }

  await fs.mkdir(directory, { recursive: true })

  const filename = buildCaptureFilename(date)
  const fullPath = path.join(directory, filename)

  await fs.writeFile(fullPath, buffer)

  return { path: fullPath, filename }
}

module.exports = {
  buildCaptureFilename,
  getCaptureDirectory,
  savePngToDirectory
}
