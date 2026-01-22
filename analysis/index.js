const { analysisQueue, enqueueAnalysis, registerAnalysisHandler, clearAnalysisHandlers, queueEvents } = require('./queue')
const { handleAnalysisEvent, createAnalysisHandler } = require('./handler')
const processor = require('./processor')

const registerAnalysisHandlers = () => {
  registerAnalysisHandler(handleAnalysisEvent)
}

module.exports = {
  analysisQueue,
  enqueueAnalysis,
  registerAnalysisHandler,
  clearAnalysisHandlers,
  queueEvents,
  registerAnalysisHandlers,
  handleAnalysisEvent,
  createAnalysisHandler,
  ...processor
}
