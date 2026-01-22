const { EventEmitter } = require('node:events')

const queue = []
let analysisHandler = null
const queueEvents = new EventEmitter()
let isProcessing = false

const enqueueAnalysis = (event) => {
  if (!event || typeof event !== 'object') {
    return Promise.reject(new Error('Analysis event must be an object.'))
  }

  if (typeof event.result_md_path !== 'string' || event.result_md_path.trim().length === 0) {
    return Promise.reject(new Error('Analysis event result_md_path must be a non-empty string.'))
  }

  const entry = {}
  const promise = new Promise((resolve, reject) => {
    entry.resolve = resolve
    entry.reject = reject
  })

  entry.event = event
  queue.push(entry)
  scheduleAnalysisProcessing()

  return promise
}

const registerAnalysisHandler = (handler) => {
  if (typeof handler !== 'function') {
    throw new Error('Analysis handler must be a function.')
  }

  analysisHandler = handler
}

const clearAnalysisHandlers = () => {
  analysisHandler = null
}

const scheduleAnalysisProcessing = () => {
  if (isProcessing) {
    return
  }

  isProcessing = true
  queueEvents.emit('scheduled')
  setImmediate(processAnalysisQueue)
}

const processAnalysisQueue = async () => {
  try {
    while (queue.length > 0) {
      const entry = queue.shift()
      if (!entry) {
        continue
      }

      const { event, resolve, reject } = entry
      if (!analysisHandler) {
        console.warn('No analysis handler registered')
        resolve({ skipped: true })
        continue
      }

      try {
        const result = await analysisHandler(event)
        resolve(result)
      } catch (error) {
        console.error('Analysis handler failed', { error })
        reject(error)
      }
    }
  } finally {
    isProcessing = false
    queueEvents.emit('idle')
    if (queue.length > 0) {
      scheduleAnalysisProcessing()
    }
  }
}

module.exports = {
  analysisQueue: {
    enqueue: enqueueAnalysis,
    on: registerAnalysisHandler,
    clearHandlers: clearAnalysisHandlers,
    events: queueEvents
  },
  enqueueAnalysis,
  registerAnalysisHandler,
  clearAnalysisHandlers,
  queueEvents
}
