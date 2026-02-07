const { loadSettings } = require('../../settings')
const { enqueueAnalysis } = require('../../analysis')
const { showToast } = require('../../toast')
const { RetryableError } = require('../../utils/retry')
const { runImageExtraction } = require('./index')

const isLlmMockEnabled = () => process.env.JIMINY_LLM_MOCK === '1'

const handleImageExtractionEvent = async (event) => {
  const flowId = event?.flow_id
  if (typeof flowId !== 'string' || flowId.trim().length === 0) {
    console.error('Image extraction missing flow_id', { event })
    throw new Error('Image extraction event missing flow_id.')
  }
  const trigger = event?.trigger
  const settings = loadSettings()
  const imagePath = event?.metadata?.path
  if (!imagePath) {
    console.warn('Skipping image extraction due to missing image path', { event })
    return { skipped: true, reason: 'missing_path' }
  }

  const provider = settings?.llm_provider?.provider || ''
  const apiKey = settings?.llm_provider?.api_key || ''
  const model = typeof settings?.llm_provider?.vision_model === 'string' && settings.llm_provider.vision_model.trim()
    ? settings.llm_provider.vision_model
    : undefined
  if (!provider) {
    console.warn('Skipping image extraction due to missing LLM provider', { imagePath })
    showToast({
      title: 'AI provider required',
      body: 'Select an AI provider in Settings to extract text from images.',
      type: 'warning'
    })
    return { skipped: true, reason: 'missing_provider' }
  }
  if (!apiKey && !isLlmMockEnabled()) {
    console.warn('Skipping image extraction due to missing LLM API key', { imagePath })
    showToast({
      title: 'API key required',
      body: 'Add your API key in Settings to extract text from images.',
      type: 'warning'
    })
    return { skipped: true, reason: 'missing_api_key' }
  }

  console.log('Starting image extraction', { imagePath, provider, model })

  let extractionResult
  try {
    extractionResult = await runImageExtraction({
      provider,
      apiKey,
      model,
      imagePath
    })
  } catch (error) {
    if (error instanceof RetryableError && error.status === 429) {
      console.warn('LLM provider exhausted during image extraction', {
        imagePath,
        message: error.message
      })
      showToast({
        title: 'Provider rate limited',
        body: 'Your provider is rate limited. Please wait and try again.',
        type: 'warning'
      })
      return { skipped: true, reason: 'provider_exhausted' }
    }
    throw error
  }

  const { outputPath, markdown } = extractionResult

  console.log('Image extraction saved', {
    imagePath,
    outputPath,
    chars: markdown.length
  })

  void enqueueAnalysis({ result_md_path: outputPath, flow_id: flowId, trigger })
    .catch((error) => {
      console.error('Failed to enqueue analysis event', { error, outputPath })
      showToast({
        title: 'Analysis Queue Failed',
        body: 'Image text extracted, but analysis could not be queued. Try again.',
        type: 'warning'
      })
    })

  return { outputPath }
}

module.exports = {
  handleImageExtractionEvent
}
