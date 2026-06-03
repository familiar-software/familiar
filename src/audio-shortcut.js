const normalizeMeetingRecordingShortcut = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function createMeetingRecordingShortcutController({
  globalShortcut,
  loadSettings,
  onToggleMeetingRecording,
  logger = console
} = {}) {
  if (!globalShortcut || typeof globalShortcut.register !== 'function') {
    throw new Error('globalShortcut.register is required for meeting recording shortcuts.')
  }
  if (!loadSettings || typeof loadSettings !== 'function') {
    throw new Error('loadSettings is required for meeting recording shortcuts.')
  }
  if (!onToggleMeetingRecording || typeof onToggleMeetingRecording !== 'function') {
    throw new Error('onToggleMeetingRecording is required for meeting recording shortcuts.')
  }

  let currentShortcut = null

  const unregisterCurrent = () => {
    if (!currentShortcut) {
      return
    }

    try {
      globalShortcut.unregister(currentShortcut)
      logger.log?.('Meeting recording shortcut unregistered', {
        shortcut: currentShortcut
      })
    } catch (error) {
      logger.error?.('Failed to unregister meeting recording shortcut', {
        shortcut: currentShortcut,
        message: error?.message || String(error)
      })
    } finally {
      currentShortcut = null
    }
  }

  const registerFromSettings = (settings = loadSettings()) => {
    const nextShortcut = normalizeMeetingRecordingShortcut(settings?.meetingRecordingShortcut)
    if (nextShortcut === currentShortcut) {
      return {
        ok: true,
        shortcut: currentShortcut,
        registered: Boolean(currentShortcut)
      }
    }

    unregisterCurrent()

    if (!nextShortcut) {
      return { ok: true, shortcut: null, registered: false }
    }

    const didRegister = globalShortcut.register(nextShortcut, () => {
      try {
        const result = onToggleMeetingRecording()
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            logger.error?.('Meeting recording shortcut action failed', {
              shortcut: nextShortcut,
              message: error?.message || String(error)
            })
          })
        }
      } catch (error) {
        logger.error?.('Meeting recording shortcut action failed', {
          shortcut: nextShortcut,
          message: error?.message || String(error)
        })
      }
    })

    if (!didRegister) {
      logger.warn?.('Meeting recording shortcut registration failed', {
        shortcut: nextShortcut
      })
      return {
        ok: false,
        shortcut: nextShortcut,
        registered: false,
        message: 'Failed to register meeting recording shortcut.'
      }
    }

    currentShortcut = nextShortcut
    logger.log?.('Meeting recording shortcut registered', {
      shortcut: nextShortcut
    })
    return { ok: true, shortcut: nextShortcut, registered: true }
  }

  const dispose = () => {
    unregisterCurrent()
  }

  return {
    dispose,
    registerFromSettings
  }
}

module.exports = {
  createMeetingRecordingShortcutController,
  normalizeMeetingRecordingShortcut
}
