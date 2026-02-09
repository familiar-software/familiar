const fs = require('node:fs/promises')
const path = require('node:path')

const DEFAULT_IMAGE_MIME = 'image/png'

const MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

const inferMimeType = (imagePath, fallback = DEFAULT_IMAGE_MIME) => {
  if (!imagePath) {
    return fallback
  }

  const extension = path.extname(imagePath).toLowerCase()
  return MIME_BY_EXTENSION[extension] || fallback
}

const readImageAsBase64 = async (imagePath) => {
  if (!imagePath) {
    throw new Error('Image path is required to read image data.')
  }

  const buffer = await fs.readFile(imagePath)
  return buffer.toString('base64')
}

module.exports = {
  DEFAULT_IMAGE_MIME,
  inferMimeType,
  readImageAsBase64
}

