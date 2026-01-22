const { loadSettings } = require('../settings')
const { JsonContextGraphStore } = require('../context-graph')
const { DEFAULT_ANALYSIS_MODEL, runAnalysis } = require('./processor')

const isLlmMockEnabled = () => process.env.JIMINY_LLM_MOCK === '1'

const createAnalysisHandler = ({
  loadSettingsImpl = loadSettings,
  createStore = () => new JsonContextGraphStore(),
  runAnalysisImpl = runAnalysis
} = {}) => async (event) => {
  const resultMdPath = event?.result_md_path
  if (!resultMdPath) {
    console.warn('Skipping analysis due to missing result markdown path', { event })
    return { skipped: true, reason: 'missing_result_md_path' }
  }

  const settings = loadSettingsImpl()
  const apiKey = settings?.llm_provider?.api_key || ''
  if (!apiKey && !isLlmMockEnabled()) {
    console.warn('Skipping analysis due to missing LLM API key', { resultMdPath })
    return { skipped: true, reason: 'missing_api_key' }
  }

  const contextFolderPath = settings?.contextFolderPath || ''
  const store = createStore()
  const contextGraph = store.load()

  if (!contextFolderPath && !contextGraph?.rootPath) {
    console.warn('Skipping analysis due to missing context folder path', { resultMdPath })
    return { skipped: true, reason: 'missing_context_folder' }
  }

  const model = settings?.llm_provider?.analysis_model || DEFAULT_ANALYSIS_MODEL
  console.log('Starting analysis for result markdown', { resultMdPath, model })

  const result = await runAnalysisImpl({
    resultMdPath,
    contextGraph,
    contextFolderPath,
    apiKey,
    model
  })

  console.log('Analysis saved', {
    resultMdPath,
    outputPath: result.outputPath,
    relevantNodeId: result.relevantNodeId
  })

  return result
}

const handleAnalysisEvent = createAnalysisHandler()

module.exports = {
  handleAnalysisEvent,
  createAnalysisHandler
}
