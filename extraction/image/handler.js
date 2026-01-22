const { loadSettings } = require('../../settings')
const { enqueueAnalysis } = require('../../analysis')
const { DEFAULT_VISION_MODEL, runImageExtraction } = require('./index')

const isLlmMockEnabled = () => process.env.JIMINY_LLM_MOCK === '1'

const handleImageExtractionEvent = async (event) => {
  const imagePath = event?.metadata?.path
  if (!imagePath) {
    console.warn('Skipping image extraction due to missing image path', { event })
    return { skipped: true, reason: 'missing_path' }
  }

  const settings = loadSettings()
  const apiKey = settings?.llm_provider?.api_key || ''
  if (!apiKey && !isLlmMockEnabled()) {
    console.warn('Skipping image extraction due to missing LLM API key', { imagePath })
    return { skipped: true, reason: 'missing_api_key' }
  }

  console.log('Starting image extraction', { imagePath, model: DEFAULT_VISION_MODEL })

  const { outputPath, markdown } = await runImageExtraction({
    apiKey,
    model: DEFAULT_VISION_MODEL,
    imagePath
  })

  console.log('Image extraction saved', {
    imagePath,
    outputPath,
    chars: markdown.length
  })

  void enqueueAnalysis({ result_md_path: outputPath })
    .catch((error) => {
      console.error('Failed to enqueue analysis event', { error, outputPath })
    })

  return { outputPath }
}

module.exports = {
  handleImageExtractionEvent
}
