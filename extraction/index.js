const { extractionQueue, enqueueExtraction, registerExtractionHandler, clearExtractionHandlers, queueEvents } = require('./queue')
const { handleImageExtractionEvent } = require('./image/handler')

const registerExtractionHandlers = () => {
  registerExtractionHandler('image', handleImageExtractionEvent)
}

module.exports = {
  extractionQueue,
  enqueueExtraction,
  registerExtractionHandler,
  clearExtractionHandlers,
  queueEvents,
  registerExtractionHandlers
}
