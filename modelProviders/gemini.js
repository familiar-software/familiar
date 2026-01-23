const { withHttpRetry, HttpRetryableError } = require('../utils/retry')
const { ExhaustedLlmProviderError } = require('./errors')

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-2.0-flash-lite'
const DEFAULT_GEMINI_VISION_MODEL = 'gemini-2.0-flash'

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
            if (response.status === 429) {
                throw new ExhaustedLlmProviderError()
            }
            throw new Error(`Gemini ${context} request failed: ${response.status} ${message}`)
        }

        return response
    } catch (error) {
        if (error instanceof HttpRetryableError) {
            logGeminiFailure({ context, status: error.status, message: error.message })
            if (error.status === 429) {
                throw new ExhaustedLlmProviderError()
            }
            throw new Error(`Gemini ${context} request failed: ${error.status} ${error.message}`)
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
        })
    }
})

module.exports = {
    DEFAULT_GEMINI_TEXT_MODEL,
    DEFAULT_GEMINI_VISION_MODEL,
    ExhaustedLlmProviderError,
    createGeminiProvider,
    generateContent,
    generateVisionContent
}
