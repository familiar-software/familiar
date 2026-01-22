const { EventEmitter } = require('node:events')

const queue = []
const extractionHandlers = new Map()
const queueEvents = new EventEmitter()
let isProcessing = false

const enqueueExtraction = (event) => {
  if (!event || typeof event !== 'object') {
    return Promise.reject(new Error('Extraction event must be an object.'))
  }

  if (typeof event.sourceType !== 'string' || event.sourceType.trim().length === 0) {
    return Promise.reject(new Error('Extraction event sourceType must be a non-empty string.'))
  }

  const entry = {}
  const promise = new Promise((resolve, reject) => {
    entry.resolve = resolve
    entry.reject = reject
  })

  entry.event = event
  queue.push(entry)
  scheduleExtractionProcessing()

  return promise
}

const registerExtractionHandler = (sourceType, handler) => {
  if (typeof sourceType !== 'string' || sourceType.trim().length === 0) {
    throw new Error('Extraction handler sourceType must be a non-empty string.')
  }
  if (typeof handler !== 'function') {
    throw new Error('Extraction handler must be a function.')
  }

  extractionHandlers.set(sourceType, handler)
}

const clearExtractionHandlers = () => {
  extractionHandlers.clear()
}

const scheduleExtractionProcessing = () => {
  if (isProcessing) {
    return
  }

  isProcessing = true
  queueEvents.emit('scheduled')
  setImmediate(processExtractionQueue)
}

const processExtractionQueue = async () => {
  try {
    while (queue.length > 0) {
      const entry = queue.shift()
      if (!entry) {
        continue
      }

      const { event, resolve, reject } = entry
      const handler = extractionHandlers.get(event.sourceType)
      if (!handler) {
        console.warn('No extraction handler registered for sourceType', { sourceType: event.sourceType })
        resolve({ skipped: true })
        continue
      }

      try {
        const result = await handler(event)
        resolve(result)
      } catch (error) {
        console.error('Extraction handler failed', { sourceType: event.sourceType, error })
        reject(error)
      }
    }
  } finally {
    isProcessing = false
    queueEvents.emit('idle')
    if (queue.length > 0) {
      scheduleExtractionProcessing()
    }
  }
}

module.exports = {
  extractionQueue: {
    enqueue: enqueueExtraction,
    on: registerExtractionHandler,
    clearHandlers: clearExtractionHandlers,
    events: queueEvents
  },
  enqueueExtraction,
  registerExtractionHandler,
  clearExtractionHandlers,
  queueEvents
}
