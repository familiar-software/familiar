const { withHttpRetry, RetryableError } = require('../utils/retry')
const { InvalidLlmProviderApiKeyError } = require('./errors')

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-2.5-flash-lite'
const DEFAULT_GEMINI_VISION_MODEL = 'gemini-2.5-flash-lite'

const extractTextFromPayload = (payload) => {
    const candidates = payload?.candidates
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return ''
    }

    const parts = candidates[0]?.content?.parts
    if (!Array.isArray(parts) || parts.length === 0) {
        return ''
    }

    return parts.map((part) => part?.text || '').join('')
}

const buildGeminiUrl = ({ model, apiKey }) => `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`

const logGeminiFailure = ({ context, status, message }) => {
    console.warn(`Gemini ${context} request failed`, { status, message })
}

const parseGeminiError = ({ status, message }) => {
    if (status === 400 || status === 401) {
        const normalized = (message || '').toLowerCase()
        if (normalized.includes('api key not valid') || normalized.includes('api_key_invalid')) {
            return new InvalidLlmProviderApiKeyError({
                provider: 'gemini',
                status,
                message: 'Gemini API key is invalid.'
            })
        }
    }
    return null
}

const requestGemini = async ({
    apiKey,
    model,
    payload,
    context
} = {}) => {
    if (!apiKey) {
        throw new Error('LLM API key is required for Gemini requests.')
    }

    const url = buildGeminiUrl({ model, apiKey })
    const retryingFetch = withHttpRetry(fetch)

    try {
        const response = await retryingFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            const message = await response.text()
            logGeminiFailure({ context, status: response.status, message })
            const parsedError = parseGeminiError({ status: response.status, message })
            if (parsedError) {
                throw parsedError
            }
            throw new Error(`Gemini ${context} request failed: ${response.status} ${message}`)
        }

        return response
    } catch (error) {
        if (error instanceof RetryableError) {
            logGeminiFailure({ context, status: error.status, message: error.message })
            throw error
        }

        throw error
    }
}

const generateContent = async ({ apiKey, model, prompt } = {}) => {
    const response = await requestGemini({
        apiKey,
        model,
        context: 'text',
        payload: {
            contents: [{ parts: [{ text: prompt }] }]
        }
    })

    const payload = await response.json()
    return extractTextFromPayload(payload).trim()
}

const generateVisionContent = async ({
    apiKey,
    model,
    prompt,
    imageBase64,
    mimeType = 'image/png'
} = {}) => {
    if (!apiKey) {
        throw new Error('LLM API key is required for Gemini vision extraction.')
    }

    if (!imageBase64) {
        throw new Error('Image data is required for Gemini vision extraction.')
    }

    const response = await requestGemini({
        apiKey,
        model,
        context: 'vision',
        payload: {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: imageBase64
                            }
                        }
                    ]
                }
            ]
        }
    })

    const payload = await response.json()
    return extractTextFromPayload(payload).trim()
}

const generateVisionBatchContent = async ({
    apiKey,
    model,
    prompt,
    images
} = {}) => {
    if (!apiKey) {
        throw new Error('LLM API key is required for Gemini vision extraction.')
    }
    if (!Array.isArray(images) || images.length === 0) {
        throw new Error('Images are required for Gemini vision batch extraction.')
    }

    const parts = [{ text: prompt }]
    for (const image of images) {
        if (!image?.imageBase64) {
            throw new Error('Image data is required for Gemini vision batch extraction.')
        }
        const mimeType = image.mimeType || 'image/png'
        parts.push({ text: `Image id: ${image.id}` })
        parts.push({
            inline_data: {
                mime_type: mimeType,
                data: image.imageBase64
            }
        })
    }

    const response = await requestGemini({
        apiKey,
        model,
        context: 'vision',
        payload: {
            contents: [
                {
                    role: 'user',
                    parts
                }
            ]
        }
    })

    const payload = await response.json()
    return extractTextFromPayload(payload).trim()
}

const createGeminiProvider = ({
    apiKey,
    textModel = DEFAULT_GEMINI_TEXT_MODEL,
    visionModel = DEFAULT_GEMINI_VISION_MODEL
} = {}) => ({
    name: 'gemini',
    text: {
        model: textModel,
        generate: async (prompt) => generateContent({
            apiKey,
            model: textModel,
            prompt
        })
    },
    vision: {
        model: visionModel,
        extract: async ({ prompt, imageBase64, mimeType }) => generateVisionContent({
            apiKey,
            model: visionModel,
            prompt,
            imageBase64,
            mimeType
        }),
        extractBatch: async ({ prompt, images }) => generateVisionBatchContent({
            apiKey,
            model: visionModel,
            prompt,
            images
        })
    }
})

module.exports = {
    DEFAULT_GEMINI_TEXT_MODEL,
    DEFAULT_GEMINI_VISION_MODEL,
    createGeminiProvider,
    generateContent,
    generateVisionContent,
    generateVisionBatchContent
}
