function createFinalizationWatchdog ({ logger, scheduler, timeoutMs }) {
  let timer = null

  function clear () {
    if (!timer) {
      return
    }
    scheduler.clearTimeout(timer)
    timer = null
  }

  function touch (helper) {
    clear()
    timer = scheduler.setTimeout(() => {
      timer = null
      if (helper) {
        logger.warn('Meeting speech helper did not stop in time; killing process')
        helper.kill('SIGKILL')
      }
    }, timeoutMs)
    if (timer && typeof timer.unref === 'function') {
      timer.unref()
    }
  }

  return { clear, touch }
}

module.exports = { createFinalizationWatchdog }
