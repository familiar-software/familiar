const { withHttpRetry, HttpRetryableError } = require('../utils/retry')
const { ExhaustedLlmProviderError, InvalidLlmProviderApiKeyError } = require('./errors')

const OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_OPENAI_TEXT_MODEL = 'gpt-4o-mini'
const DEFAULT_OPENAI_VISION_MODEL = 'gpt-4.1-mini'

const logOpenAiFailure = ({ context, status, message }) => {
  console.warn(`OpenAI ${context} request failed`, { status, message })
}

const parseOpenAiError = ({ status, message }) => {
  if (status === 401 || status === 403) {
    const normalized = (message || '').toLowerCase()
    if (normalized.includes('incorrect api key') || normalized.includes('invalid api key')) {
      return new InvalidLlmProviderApiKeyError({
        provider: 'openai',
        status,
        message: 'OpenAI API key is invalid.'
      })
    }
  }
  return null
}

const buildOpenAiHeaders = (apiKey) => {
  if (!apiKey) {
    throw new Error('LLM API key is required for OpenAI requests.')
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }
}

const extractTextFromResponse = (payload) => {
  const choice = payload?.choices?.[0]
  const content = choice?.message?.content

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content.map((part) => part?.text || '').join('')
  }

  return ''
}

const requestOpenAi = async ({ apiKey, payload, context } = {}) => {
  const url = `${OPENAI_BASE_URL}/chat/completions`
  const retryingFetch = withHttpRetry(fetch)

  try {
    const response = await retryingFetch(url, {
      method: 'POST',
      headers: buildOpenAiHeaders(apiKey),
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const message = await response.text()
      logOpenAiFailure({ context, status: response.status, message })
      if (response.status === 429) {
        throw new ExhaustedLlmProviderError()
      }
      const parsedError = parseOpenAiError({ status: response.status, message })
      if (parsedError) {
        throw parsedError
      }
      throw new Error(`OpenAI ${context} request failed: ${response.status} ${message}`)
    }

    return response
  } catch (error) {
    if (error instanceof HttpRetryableError) {
      logOpenAiFailure({ context, status: error.status, message: error.message })
      if (error.status === 429) {
        throw new ExhaustedLlmProviderError()
      }
      const parsedError = parseOpenAiError({ status: error.status, message: error.message })
      if (parsedError) {
        throw parsedError
      }
      throw new Error(`OpenAI ${context} request failed: ${error.status} ${error.message}`)
    }

    throw error
  }
}

const generateText = async ({ apiKey, model, prompt } = {}) => {
  const response = await requestOpenAi({
    apiKey,
    context: 'text',
    payload: {
      model,
      messages: [{ role: 'user', content: prompt }]
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
    throw new Error('Image data is required for OpenAI vision extraction.')
  }

  const dataUrl = `data:${mimeType};base64,${imageBase64}`
  const response = await requestOpenAi({
    apiKey,
    context: 'vision',
    payload: {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ]
    }
  })

  const payload = await response.json()
  return extractTextFromResponse(payload).trim()
}

const generateVisionBatchText = async ({ apiKey, model, prompt, images } = {}) => {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('Images are required for OpenAI vision batch extraction.')
  }

  const content = [{ type: 'text', text: prompt }]
  for (const image of images) {
    if (!image?.imageBase64) {
      throw new Error('Image data is required for OpenAI vision batch extraction.')
    }
    const mimeType = image.mimeType || 'image/png'
    const dataUrl = `data:${mimeType};base64,${image.imageBase64}`
    content.push({ type: 'text', text: `Image id: ${image.id}` })
    content.push({ type: 'image_url', image_url: { url: dataUrl } })
  }

  const response = await requestOpenAi({
    apiKey,
    context: 'vision',
    payload: {
      model,
      messages: [{ role: 'user', content }]
    }
  })

  const payload = await response.json()
  return extractTextFromResponse(payload).trim()
}

const createOpenAIProvider = ({
  apiKey,
  textModel = DEFAULT_OPENAI_TEXT_MODEL,
  visionModel = DEFAULT_OPENAI_VISION_MODEL
} = {}) => ({
  name: 'openai',
  text: {
    model: textModel,
    generate: async (prompt) => generateText({ apiKey, model: textModel, prompt })
  },
  vision: {
    model: visionModel,
    extract: async ({ prompt, imageBase64, mimeType }) =>
      generateVisionText({
        apiKey,
        model: visionModel,
        prompt,
        imageBase64,
        mimeType
      }),
    extractBatch: async ({ prompt, images }) =>
      generateVisionBatchText({
        apiKey,
        model: visionModel,
        prompt,
        images
      })
  }
})

const generateVisionTextWithUsage = async ({
  apiKey,
  model,
  prompt,
  imageBase64,
  mimeType = 'image/png',
  detail
} = {}) => {
  if (!imageBase64) {
    throw new Error('Image data is required for OpenAI vision extraction.')
  }

  const dataUrl = `data:${mimeType};base64,${imageBase64}`
  const imageUrl = { url: dataUrl }
  if (detail) {
    imageUrl.detail = detail
  }
  const response = await requestOpenAi({
    apiKey,
    context: 'vision',
    payload: {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: imageUrl }
          ]
        }
      ]
    }
  })

  const payload = await response.json()
  return {
    text: extractTextFromResponse(payload).trim(),
    usage: payload?.usage || null
  }
}

module.exports = {
  DEFAULT_OPENAI_TEXT_MODEL,
  DEFAULT_OPENAI_VISION_MODEL,
  createOpenAIProvider,
  generateText,
  generateVisionText,
  generateVisionBatchText,
  generateVisionTextWithUsage
}
