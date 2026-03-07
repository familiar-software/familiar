const path = require('node:path')

const getTrayIconPathForMenuBar = ({
  defaultIconPath,
  hasUnreadHeartbeats = false,
  isDarkMode = true
} = {}) => {
  if (!hasUnreadHeartbeats) {
    return defaultIconPath
  }

  const trayDir = path.dirname(defaultIconPath)
  return path.join(trayDir, 'icon_green_owl.png')
}

const createTrayIconFactory = ({
  nativeImage,
  logger = console
} = {}) => {
  const cache = new Map()

  return ({
    defaultIconPath,
    hasUnreadHeartbeats = false,
    isDarkMode = true
  } = {}) => {
    if (!nativeImage) {
      return null
    }

    const cacheKey = `${defaultIconPath}:${hasUnreadHeartbeats ? 'unread' : 'normal'}:${isDarkMode ? 'dark' : 'light'}`
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)
    }

    const preferredPath = getTrayIconPathForMenuBar({
      defaultIconPath,
      hasUnreadHeartbeats,
      isDarkMode
    })
    let trayIconBase = nativeImage.createFromPath(preferredPath)
    if ((!trayIconBase || trayIconBase.isEmpty()) && preferredPath !== defaultIconPath) {
      trayIconBase = nativeImage.createFromPath(defaultIconPath)
    }
    if (!trayIconBase || trayIconBase.isEmpty()) {
      logger.warn('Tray icon image creation failed', {
        defaultIconPath,
        preferredPath,
        hasUnreadHeartbeats,
        isDarkMode
      })
      return nativeImage.createEmpty()
    }

    const resizedIcon = typeof trayIconBase.resize === 'function'
      ? trayIconBase.resize({ width: 16, height: 16 })
      : trayIconBase

    const finalIcon = resizedIcon

    if (typeof finalIcon.setTemplateImage === 'function') {
      finalIcon.setTemplateImage(!hasUnreadHeartbeats && process.platform === 'darwin')
    }

    cache.set(cacheKey, finalIcon)
    return finalIcon
  }
}

module.exports = {
  createTrayIconFactory,
  getTrayIconPathForMenuBar
}
