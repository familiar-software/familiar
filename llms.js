const { createModelProviderClients, DEFAULT_TEXT_MODELS, ExhaustedLlmProviderError } = require('./modelProviders');

const DEFAULT_MODEL = DEFAULT_TEXT_MODELS.gemini;

const buildFilePrompt = ({ relativePath, content }) =>
    `Summarize the following file for a context index.\n` +
    `File: ${relativePath}\n` +
    `Instructions: Provide a concise, high-signal summary that captures the purpose, key facts, and decisions. ` +
    `Avoid fluff. Write in plain sentences.\n\n` +
    `Content:\n${content}`;

const buildFolderPrompt = ({ relativePath, summaries }) =>
    `Summarize the contents of this folder using the file summaries below.\n` +
    `Folder: ${relativePath || '.'}\n` +
    `Instructions: Provide a concise overview of the folder's themes, key artifacts, and how the files relate. ` +
    `Avoid repeating every file name.\n\n` +
    `File summaries:\n${summaries}`;

const createProviderSummarizer = ({ provider, apiKey, textModel } = {}) => {
    const clients = createModelProviderClients({ provider, apiKey, textModel });
    return {
        provider: clients.name,
        model: clients.text.model,
        summarizeFile: async ({ relativePath, content }) =>
            clients.text.generate(buildFilePrompt({ relativePath, content })),
        summarizeFolder: async ({ relativePath, summaries }) =>
            clients.text.generate(buildFolderPrompt({ relativePath, summaries })),
    };
};

const createGeminiSummarizer = ({ apiKey, model = DEFAULT_MODEL } = {}) =>
    createProviderSummarizer({ provider: 'gemini', apiKey, textModel: model });

const createMockSummarizer = ({ text = 'gibberish', model = 'mock' } = {}) => ({
    model,
    summarizeFile: async () => text,
    summarizeFolder: async () => text,
});

const createSummarizer = (options = {}) => {
    if (process.env.JIMINY_LLM_MOCK === '1') {
        return createMockSummarizer({ text: process.env.JIMINY_LLM_MOCK_TEXT || 'gibberish' });
    }

    return createProviderSummarizer(options);
};

module.exports = {
    DEFAULT_MODEL,
    ExhaustedLlmProviderError,
    createGeminiSummarizer,
    createProviderSummarizer,
    createMockSummarizer,
    createSummarizer,
};
