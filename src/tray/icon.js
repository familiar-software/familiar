const getTrayIconPathForMenuBar = ({
  defaultIconPath
} = {}) => {
  return defaultIconPath
}

const createTrayIconFactory = ({
  nativeImage,
  logger = console
} = {}) => {
  const cache = new Map()

  return ({
    defaultIconPath,
    isDarkMode = true
  } = {}) => {
    if (!nativeImage) {
      return null
    }

    const cacheKey = `${defaultIconPath}:${isDarkMode ? 'dark' : 'light'}`
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

    const finalIcon = resizedIcon

    if (typeof finalIcon.setTemplateImage === 'function') {
      finalIcon.setTemplateImage(process.platform === 'darwin')
    }

    cache.set(cacheKey, finalIcon)
    return finalIcon
  }
}

module.exports = {
  createTrayIconFactory,
  getTrayIconPathForMenuBar
}
