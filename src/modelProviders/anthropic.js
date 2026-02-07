const { withHttpRetry, RetryableError } = require('../utils/retry')
const { InvalidLlmProviderApiKeyError } = require('./errors')

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
const DEFAULT_ANTHROPIC_TEXT_MODEL = 'claude-3-5-sonnet-20240620'
const DEFAULT_ANTHROPIC_VISION_MODEL = 'claude-3-5-sonnet-20240620'
const DEFAULT_ANTHROPIC_MAX_TOKENS = 2048

const logAnthropicFailure = ({ context, status, message }) => {
  console.warn(`Anthropic ${context} request failed`, { status, message })
}

const parseAnthropicError = ({ status, message }) => {
  if (status === 401 || status === 403) {
    const normalized = (message || '').toLowerCase()
    if (normalized.includes('invalid api key') || normalized.includes('authentication_error')) {
      return new InvalidLlmProviderApiKeyError({
        provider: 'anthropic',
        status,
        message: 'Anthropic API key is invalid.'
      })
    }
  }
  return null
}

const buildAnthropicHeaders = (apiKey) => {
  if (!apiKey) {
    throw new Error('LLM API key is required for Anthropic requests.')
  }

  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  }
}

const extractTextFromResponse = (payload) => {
  const content = payload?.content
  if (!Array.isArray(content)) {
    return ''
  }

  return content.map((part) => part?.text || '').join('')
}

const requestAnthropic = async ({ apiKey, payload, context } = {}) => {
  const url = `${ANTHROPIC_BASE_URL}/messages`
  const retryingFetch = withHttpRetry(fetch)

  try {
    const response = await retryingFetch(url, {
      method: 'POST',
      headers: buildAnthropicHeaders(apiKey),
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const message = await response.text()
      logAnthropicFailure({ context, status: response.status, message })
      const parsedError = parseAnthropicError({ status: response.status, message })
      if (parsedError) {
        throw parsedError
      }
      throw new Error(`Anthropic ${context} request failed: ${response.status} ${message}`)
    }

    return response
  } catch (error) {
    if (error instanceof RetryableError) {
      logAnthropicFailure({ context, status: error.status, message: error.message })
      throw error
    }

    throw error
  }
}

const generateText = async ({ apiKey, model, prompt } = {}) => {
  const response = await requestAnthropic({
    apiKey,
    context: 'text',
    payload: {
      model,
      max_tokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    }
  })

  const payload = await response.json()
  return extractTextFromResponse(payload).trim()
}

const generateVisionText = async ({
  apiKey,
  model,
  prompt,
  imageBase64,
  mimeType = 'image/png'
} = {}) => {
  if (!imageBase64) {
    throw new Error('Image data is required for Anthropic vision extraction.')
  }

  const response = await requestAnthropic({
    apiKey,
    context: 'vision',
    payload: {
      model,
      max_tokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ]
    }
  })

  const payload = await response.json()
  return extractTextFromResponse(payload).trim()
}

const generateVisionBatchText = async ({
  apiKey,
  model,
  prompt,
  images
} = {}) => {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('Images are required for Anthropic vision batch extraction.')
  }

  const content = [{ type: 'text', text: prompt }]
  for (const image of images) {
    if (!image?.imageBase64) {
      throw new Error('Image data is required for Anthropic vision batch extraction.')
    }
    const mimeType = image.mimeType || 'image/png'
    content.push({ type: 'text', text: `Image id: ${image.id}` })
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType,
        data: image.imageBase64
      }
    })
  }

  const response = await requestAnthropic({
    apiKey,
    context: 'vision',
    payload: {
      model,
      max_tokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
      messages: [{ role: 'user', content }]
    }
  })

  const payload = await response.json()
  return extractTextFromResponse(payload).trim()
}

const createAnthropicProvider = ({
  apiKey,
  textModel = DEFAULT_ANTHROPIC_TEXT_MODEL,
  visionModel = DEFAULT_ANTHROPIC_VISION_MODEL
} = {}) => ({
  name: 'anthropic',
  text: {
    model: textModel,
    generate: async (prompt) => generateText({ apiKey, model: textModel, prompt })
  },
  vision: {
    model: visionModel,
    extract: async ({ prompt, imageBase64, mimeType }) => generateVisionText({
      apiKey,
      model: visionModel,
      prompt,
      imageBase64,
      mimeType
    }),
    extractBatch: async ({ prompt, images }) => generateVisionBatchText({
      apiKey,
      model: visionModel,
      prompt,
      images
    })
  }
})

module.exports = {
  DEFAULT_ANTHROPIC_TEXT_MODEL,
  DEFAULT_ANTHROPIC_VISION_MODEL,
  createAnthropicProvider,
  generateText,
  generateVisionText,
  generateVisionBatchText
}
