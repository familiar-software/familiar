const { createGeminiProvider, DEFAULT_GEMINI_TEXT_MODEL, DEFAULT_GEMINI_VISION_MODEL } = require('./gemini');
const { createOpenAIProvider, DEFAULT_OPENAI_TEXT_MODEL, DEFAULT_OPENAI_VISION_MODEL } = require('./openai');
const {
    createAnthropicProvider,
    DEFAULT_ANTHROPIC_TEXT_MODEL,
    DEFAULT_ANTHROPIC_VISION_MODEL,
} = require('./anthropic');
const { ExhaustedLlmProviderError } = require('./errors');

const PROVIDER_CREATORS = {
    gemini: createGeminiProvider,
    openai: createOpenAIProvider,
    anthropic: createAnthropicProvider,
};

const DEFAULT_TEXT_MODELS = {
    gemini: DEFAULT_GEMINI_TEXT_MODEL,
    openai: DEFAULT_OPENAI_TEXT_MODEL,
    anthropic: DEFAULT_ANTHROPIC_TEXT_MODEL,
};

const DEFAULT_VISION_MODELS = {
    gemini: DEFAULT_GEMINI_VISION_MODEL,
    openai: DEFAULT_OPENAI_VISION_MODEL,
    anthropic: DEFAULT_ANTHROPIC_VISION_MODEL,
};

const normalizeProviderName = (provider) => (typeof provider === 'string' ? provider.trim().toLowerCase() : '');

const createModelProviderClients = ({ provider, apiKey, textModel, visionModel } = {}) => {
    const normalized = normalizeProviderName(provider);
    if (!normalized) {
        throw new Error('LLM provider is required.');
    }

    const creator = PROVIDER_CREATORS[normalized];
    if (!creator) {
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    return creator({ apiKey, textModel, visionModel });
};

const getProviderNames = () => Object.keys(PROVIDER_CREATORS);

module.exports = {
    ExhaustedLlmProviderError,
    DEFAULT_TEXT_MODELS,
    DEFAULT_VISION_MODELS,
    createModelProviderClients,
    getProviderNames,
    normalizeProviderName,
};
