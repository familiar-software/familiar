const SLEEP_AFTER_DISABLE_MS = 1_000
const path = require('node:path')

function toErrorMessage(error) {
  if (error && typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }
  return null
}

function isPathInsideOrEqual(basePath, candidatePath) {
  const base = path.resolve(basePath)
  const candidate = path.resolve(candidatePath)
  const relative = path.relative(base, candidate)
  return relative === '' || (
    relative.length > 0
      && !relative.startsWith('..')
      && !path.isAbsolute(relative)
  )
}

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

async function restoreCaptureSetting({
  enabled,
  saveSettings,
  updateScreenCaptureFromSettings,
  notifyAlwaysRecordWhenActiveChanged,
  logger
}) {
  try {
    saveSettings({ alwaysRecordWhenActive: enabled })
  } catch (error) {
    const message = toErrorMessage(error) || 'Failed to update capture settings.'
    logger.error('Failed to toggle alwaysRecordWhenActive for context folder move', {
      enabled,
      message
    })
    return { ok: false, message }
  }

  updateScreenCaptureFromSettings()
  if (typeof notifyAlwaysRecordWhenActiveChanged === 'function') {
    notifyAlwaysRecordWhenActiveChanged({ enabled })
  }
  return { ok: true }
}

async function restoreFamiliarFolderToSource({
  sourceContextFolderPath,
  destinationContextFolderPath,
  moveFamiliarFolder,
  logger,
  loggerContext
}) {
  try {
    await moveFamiliarFolder({
      sourceContextFolderPath: destinationContextFolderPath,
      destinationContextFolderPath: sourceContextFolderPath,
      logger
    })
    return { ok: true }
  } catch (error) {
    const message = toErrorMessage(error) || 'Failed to restore familiar folder.'
    logger.error('Failed to restore familiar folder after settings save failure', {
      message,
      ...loggerContext
    })
    return { ok: false, message }
  }
}

function createMoveContextFolderHandler(options = {}) {
  const {
    loadSettings,
    saveSettings,
    validateContextFolderPath,
    moveFamiliarFolder,
    updateScreenCaptureFromSettings,
    notifyAlwaysRecordWhenActiveChanged,
    logger = console
  } = options

  return async (payload = {}) => {
    const requestedContextFolderPath = typeof payload?.contextFolderPath === 'string'
      ? payload.contextFolderPath
      : ''
    const validation = validateContextFolderPath(requestedContextFolderPath)
    if (!validation.ok) {
      return { ok: false, message: validation.message || 'Invalid context folder path.' }
    }

    const destinationContextFolderPath = validation.path
    const settings = loadSettings()
    const sourceContextFolderPath = settings?.contextFolderPath

    if (typeof sourceContextFolderPath !== 'string' || sourceContextFolderPath.trim().length === 0) {
      return { ok: false, message: 'Current context folder path is missing.' }
    }

    const familiarRootPath = path.join(sourceContextFolderPath, 'familiar')
    if (isPathInsideOrEqual(familiarRootPath, destinationContextFolderPath)) {
      return {
        ok: false,
        message: 'Destination context folder must not be inside the current familiar folder.'
      }
    }

    const shouldTemporarilyDisableCapture = settings.alwaysRecordWhenActive === true
    const restoredCaptureSetting = settings.alwaysRecordWhenActive === true

    if (shouldTemporarilyDisableCapture) {
      const disableResult = await restoreCaptureSetting({
        enabled: false,
        saveSettings,
        updateScreenCaptureFromSettings,
        notifyAlwaysRecordWhenActiveChanged,
        logger
      })

      if (disableResult.ok !== true) {
        return {
          ok: false,
          message: `Failed to disable capture while moving folder: ${disableResult.message}`
        }
      }

      await sleep(SLEEP_AFTER_DISABLE_MS)
    }

    try {
      await moveFamiliarFolder({
        sourceContextFolderPath,
        destinationContextFolderPath,
        logger
      })
    } catch (error) {
      if (shouldTemporarilyDisableCapture) {
        const enableResult = await restoreCaptureSetting({
          enabled: true,
          saveSettings,
          updateScreenCaptureFromSettings,
          notifyAlwaysRecordWhenActiveChanged,
          logger
        })
        if (!enableResult.ok) {
          return {
            ok: false,
            message: `Failed to move familiar folder: ${toErrorMessage(error) || 'unknown error'}. ` +
              `Additionally, capture could not be restored: ${enableResult.message}`
          }
        }
      }

      return {
        ok: false,
        message: toErrorMessage(error) || 'Failed to move context folder.'
      }
    }

    try {
      saveSettings({ contextFolderPath: destinationContextFolderPath })
    } catch (error) {
      const restoreResult = await restoreFamiliarFolderToSource({
        sourceContextFolderPath,
        destinationContextFolderPath,
        moveFamiliarFolder,
        logger,
        loggerContext: { sourceContextFolderPath, destinationContextFolderPath }
      })

      const restoreWarning = restoreResult.ok !== true
        ? `Context folder moved to the new location, but restoring it back failed: ${restoreResult.message}`
        : null

      if (shouldTemporarilyDisableCapture) {
        const enableResult = await restoreCaptureSetting({
          enabled: true,
          saveSettings,
          updateScreenCaptureFromSettings,
          notifyAlwaysRecordWhenActiveChanged,
          logger
        })

        if (!enableResult.ok) {
          return {
            ok: false,
            message: `Failed to save context folder setting: ${toErrorMessage(error) || 'unknown error'}. ` +
              `${restoreWarning ? `${restoreWarning} ` : ''}` +
              `Also, capture could not be restored: ${enableResult.message}`
          }
        }
      }

      if (restoreWarning) {
        return {
          ok: false,
          message: `Failed to save context folder setting: ${toErrorMessage(error) || 'unknown error'}. ${restoreWarning}`
        }
      }

      return {
        ok: false,
        message: `Failed to save context folder setting: ${toErrorMessage(error) || 'unknown error'}. ` +
          `Context folder was restored to ${sourceContextFolderPath}.`
      }
    }

    if (shouldTemporarilyDisableCapture) {
      const enableResult = await restoreCaptureSetting({
        enabled: true,
        saveSettings,
        updateScreenCaptureFromSettings,
        notifyAlwaysRecordWhenActiveChanged,
        logger
      })

      if (!enableResult.ok) {
        return {
          ok: true,
          contextFolderPath: destinationContextFolderPath,
          alwaysRecordWhenActive: restoredCaptureSetting,
          warning: `Context folder moved, but capture could not be restored: ${enableResult.message}`
        }
      }
    }

    return {
      ok: true,
      contextFolderPath: destinationContextFolderPath,
      alwaysRecordWhenActive: restoredCaptureSetting
    }
  }
}

module.exports = {
  createMoveContextFolderHandler
}
