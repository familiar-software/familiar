const { loadSettings } = require('../settings')
const { createHeartbeatHistoryStore } = require('../heartbeats/store')
const { safeFsPath } = require('../heartbeats/utils')

const DEFAULT_HEARTBEAT_TRAY_LIMIT = 5

const withHeartbeatHistoryStore = ({
  settings,
  settingsLoader = loadSettings,
  storeFactory = createHeartbeatHistoryStore,
  logger = console,
  callback
} = {}) => {
  if (typeof callback !== 'function') {
    throw new Error('callback is required')
  }

  const nextSettings = settings && typeof settings === 'object'
    ? settings
    : (typeof settingsLoader === 'function' ? settingsLoader() : null) || {}
  const contextFolderPath = safeFsPath(nextSettings.contextFolderPath)
  if (!contextFolderPath) {
    return null
  }

  let store = null
  try {
    store = storeFactory({ contextFolderPath, logger })
    return callback(store)
  } catch (error) {
    logger.warn('Failed to access heartbeat history store for tray', {
      contextFolderPath,
      message: error?.message || String(error)
    })
    return null
  } finally {
    if (store && typeof store.close === 'function') {
      store.close()
    }
  }
}

const loadRecentHeartbeatRuns = ({
  settings,
  settingsLoader = loadSettings,
  storeFactory = createHeartbeatHistoryStore,
  limit = DEFAULT_HEARTBEAT_TRAY_LIMIT,
  logger = console
} = {}) => {
  const rows = withHeartbeatHistoryStore({
    settings,
    settingsLoader,
    storeFactory,
    logger,
    callback: (store) => store.getRecentHeartbeats({ limit })
  })
  return Array.isArray(rows) ? rows : []
}

const hasUnreadHeartbeatRuns = ({
  settings,
  settingsLoader = loadSettings,
  storeFactory = createHeartbeatHistoryStore,
  logger = console
} = {}) => {
  const result = withHeartbeatHistoryStore({
    settings,
    settingsLoader,
    storeFactory,
    logger,
    callback: (store) => store.hasUnreadHeartbeats()
  })
  return result === true
}

const markAllHeartbeatRunsSeen = ({
  settings,
  settingsLoader = loadSettings,
  storeFactory = createHeartbeatHistoryStore,
  logger = console,
  seenAtUtc
} = {}) => {
  const changes = withHeartbeatHistoryStore({
    settings,
    settingsLoader,
    storeFactory,
    logger,
    callback: (store) => store.markAllHeartbeatsSeen({ seenAtUtc })
  })
  return Number(changes) || 0
}

module.exports = {
  DEFAULT_HEARTBEAT_TRAY_LIMIT,
  loadRecentHeartbeatRuns,
  hasUnreadHeartbeatRuns,
  markAllHeartbeatRunsSeen
}
