const { withHttpRetry, HttpRetryableError } = require('../utils/retry')
const { ExhaustedLlmProviderError } = require('./errors')

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
const DEFAULT_ANTHROPIC_TEXT_MODEL = 'claude-3-5-sonnet-20240620'
const DEFAULT_ANTHROPIC_VISION_MODEL = 'claude-3-5-sonnet-20240620'
const DEFAULT_ANTHROPIC_MAX_TOKENS = 2048

const logAnthropicFailure = ({ context, status, message }) => {
  console.warn(`Anthropic ${context} request failed`, { status, message })
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
      if (response.status === 429) {
        throw new ExhaustedLlmProviderError()
      }
      throw new Error(`Anthropic ${context} request failed: ${response.status} ${message}`)
    }

    return response
  } catch (error) {
    if (error instanceof HttpRetryableError) {
      logAnthropicFailure({ context, status: error.status, message: error.message })
      if (error.status === 429) {
        throw new ExhaustedLlmProviderError()
      }
      throw new Error(`Anthropic ${context} request failed: ${error.status} ${error.message}`)
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
    })
  }
})

module.exports = {
  DEFAULT_ANTHROPIC_TEXT_MODEL,
  DEFAULT_ANTHROPIC_VISION_MODEL,
  createAnthropicProvider,
  generateText,
  generateVisionText
}
