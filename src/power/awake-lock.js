function createAwakeLock ({ powerSaveBlocker, logger = console } = {}) {
  let blockerId = null

  function isActive () {
    if (blockerId === null) {
      return false
    }
    if (!powerSaveBlocker || typeof powerSaveBlocker.isStarted !== 'function') {
      return true
    }
    return powerSaveBlocker.isStarted(blockerId)
  }

  function start ({ reason } = {}) {
    if (isActive()) {
      return { ok: true, blockerId, alreadyStarted: true }
    }
    if (!powerSaveBlocker || typeof powerSaveBlocker.start !== 'function') {
      return { ok: false, message: 'Power save blocker is unavailable.' }
    }

    blockerId = powerSaveBlocker.start('prevent-display-sleep')
    logger.log('Awake lock started', { blockerId, reason: reason || null })
    return { ok: true, blockerId }
  }

  function stop ({ reason } = {}) {
    if (blockerId === null) {
      return { ok: true, alreadyStopped: true }
    }

    const nextBlockerId = blockerId
    blockerId = null
    if (powerSaveBlocker && typeof powerSaveBlocker.stop === 'function') {
      powerSaveBlocker.stop(nextBlockerId)
    }
    logger.log('Awake lock stopped', { blockerId: nextBlockerId, reason: reason || null })
    return { ok: true }
  }

  function getState () {
    return {
      blockerId,
      active: isActive()
    }
  }

  return {
    getState,
    isActive,
    start,
    stop
  }
}

module.exports = {
  createAwakeLock
}
