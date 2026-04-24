const getTrayIconPathForMenuBar = ({
  defaultIconPath
} = {}) => {
  return defaultIconPath
}

const drawSlashOnBitmap = (bitmap, width, height) => {
  const inset = Math.max(1, Math.round(width * 0.15))
  const thickness = Math.max(1, Math.round(width * 0.03))
  const halfThick = thickness / 2
  const x0 = inset
  const y0 = inset
  const x1 = width - inset
  const y1 = height - inset
  const steps = Math.max(width, height) * 2
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const cx = x0 + (x1 - x0) * t
    const cy = y0 + (y1 - y0) * t
    for (let dy = -halfThick; dy <= halfThick; dy++) {
      for (let dx = -halfThick; dx <= halfThick; dx++) {
        const px = Math.round(cx + dx)
        const py = Math.round(cy + dy)
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4
          bitmap[idx] = 0
          bitmap[idx + 1] = 0
          bitmap[idx + 2] = 0
          bitmap[idx + 3] = 255
        }
      }
    }
  }
}

const createTrayIconFactory = ({
  nativeImage,
  logger = console
} = {}) => {
  const cache = new Map()

  return ({
    defaultIconPath,
    isDarkMode = true,
    isPaused = false
  } = {}) => {
    if (!nativeImage) {
      return null
    }

    const cacheKey = `${defaultIconPath}:${isDarkMode ? 'dark' : 'light'}:${isPaused ? 'paused' : 'active'}`
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)
    }

    const preferredPath = getTrayIconPathForMenuBar({
      defaultIconPath,
      isDarkMode
    })
    let trayIconBase = nativeImage.createFromPath(preferredPath)
    if (!trayIconBase || trayIconBase.isEmpty()) {
      logger.warn('Tray icon image creation failed', {
        defaultIconPath,
        preferredPath,
        isDarkMode
      })
      return nativeImage.createEmpty()
    }

    const resizedIcon = typeof trayIconBase.resize === 'function'
      ? trayIconBase.resize({ width: 16, height: 16 })
      : trayIconBase

    let finalIcon = resizedIcon

    if (isPaused && typeof finalIcon.toBitmap === 'function') {
      const actualSize = typeof finalIcon.getSize === 'function' ? finalIcon.getSize() : { width: 16, height: 16 }
      const baseBitmap = finalIcon.toBitmap()
      const bitmapPx = Math.round(Math.sqrt(baseBitmap.length / 4))
      const scaleFactor = bitmapPx / actualSize.width
      const canvas = Buffer.from(baseBitmap)
      drawSlashOnBitmap(canvas, bitmapPx, bitmapPx)
      finalIcon = nativeImage.createFromBuffer(canvas, { width: bitmapPx, height: bitmapPx, scaleFactor: scaleFactor || 1 })
    }

    if (typeof finalIcon.setTemplateImage === 'function') {
      finalIcon.setTemplateImage(process.platform === 'darwin')
    }

    cache.set(cacheKey, finalIcon)
    return finalIcon
  }
}

module.exports = {
  createTrayIconFactory,
  drawSlashOnBitmap,
  getTrayIconPathForMenuBar
}