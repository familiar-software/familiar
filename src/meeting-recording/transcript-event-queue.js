function createTranscriptEventQueue ({ getWriter, logger = console, onError }) {
  let events = []
  let idleWaiters = []
  let isWriting = false

  function settleIdleWaiters () {
    const waiters = idleWaiters
    idleWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  function waitForIdle () {
    if (!isWriting && events.length === 0) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      idleWaiters.push(resolve)
    })
  }

  async function drain () {
    if (isWriting) {
      return
    }
    isWriting = true
    while (events.length > 0) {
      const { event, writer } = events.shift()
      try {
        await writer.writeEvent(event)
      } catch (error) {
        onError(error)
      }
    }
    isWriting = false
    settleIdleWaiters()
  }

  function enqueue (event) {
    const writer = getWriter()
    if (!event || !writer) {
      return
    }
    logger.log('Meeting transcript event received', {
      type: event.type || '',
      textLength: typeof event.text === 'string' ? event.text.length : 0,
      segmentCount: Array.isArray(event.segments) ? event.segments.length : 0,
      startedAtMs: Number.isFinite(event.startedAtMs) ? event.startedAtMs : null,
      endedAtMs: Number.isFinite(event.endedAtMs) ? event.endedAtMs : null
    })
    events.push({ event, writer })
    void drain()
  }

  return { enqueue, waitForIdle }
}

module.exports = { createTranscriptEventQueue }
