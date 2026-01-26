const path = require('path');
const { loadSettings } = require('../settings');
const { JsonContextGraphStore } = require('../context-graph');
const { runAnalysis } = require('./processor');
const { showToast } = require('../toast');
const { InvalidLlmProviderApiKeyError } = require('../modelProviders');
const { recordEvent } = require('../history');

const shortenPath = (fullPath, maxComponents = 2) => {
    const parts = fullPath.split(path.sep).filter(Boolean);
    if (parts.length <= maxComponents) {
        return fullPath;
    }
    return '.../' + parts.slice(-maxComponents).join('/');
};

const formatProviderName = (provider) => {
    const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    if (!normalized) {
        return 'LLM';
    }
    if (normalized === 'openai') return 'OpenAI';
    if (normalized === 'gemini') return 'Gemini';
    if (normalized === 'anthropic') return 'Anthropic';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const isLlmMockEnabled = () => process.env.JIMINY_LLM_MOCK === '1';

const createAnalysisHandler =
    ({
        loadSettingsImpl = loadSettings,
        createStore = ({ contextFolderPath } = {}) => new JsonContextGraphStore({ contextFolderPath }),
        runAnalysisImpl = runAnalysis,
    } = {}) =>
    async (event) => {
        const flowId = event?.flow_id;
        if (typeof flowId !== 'string' || flowId.trim().length === 0) {
            console.error('Analysis event missing flow_id', { event });
            throw new Error('Analysis event missing flow_id.');
        }
        const trigger = event?.trigger;
        const settings = loadSettingsImpl();
        const contextFolderPath = settings?.contextFolderPath || '';
        const resultMdPath = event?.result_md_path;
        if (!resultMdPath) {
            console.warn('Skipping analysis due to missing result markdown path', { event });
            recordEvent({
                contextFolderPath,
                flowId,
                trigger,
                step: 'analysis',
                status: 'skipped',
                summary: 'Analysis skipped',
                detail: 'Missing result markdown path.',
            });
            return { skipped: true, reason: 'missing_result_md_path' };
        }

        const provider = settings?.llm_provider?.provider || '';
        const apiKey = settings?.llm_provider?.api_key || '';
        const model =
            typeof settings?.llm_provider?.text_model === 'string' && settings.llm_provider.text_model.trim()
                ? settings.llm_provider.text_model
                : undefined;
        if (!provider) {
            console.warn('Skipping analysis due to missing LLM provider', { resultMdPath });
            showToast({
                title: 'LLM provider required',
                body: 'Select an LLM provider in Settings to run analysis.',
                type: 'warning',
            });
            recordEvent({
                contextFolderPath,
                flowId,
                trigger,
                step: 'analysis',
                status: 'skipped',
                summary: 'Analysis skipped',
                detail: 'Missing LLM provider.',
                sourcePath: resultMdPath,
            });
            return { skipped: true, reason: 'missing_provider' };
        }
        if (!apiKey && !isLlmMockEnabled()) {
            console.warn('Skipping analysis due to missing LLM API key', { resultMdPath });
            showToast({
                title: 'LLM API key required',
                body: 'Add your LLM API key in Settings to run analysis.',
                type: 'warning',
            });
            recordEvent({
                contextFolderPath,
                flowId,
                trigger,
                step: 'analysis',
                status: 'skipped',
                summary: 'Analysis skipped',
                detail: 'Missing LLM API key.',
                sourcePath: resultMdPath,
            });
            return { skipped: true, reason: 'missing_api_key' };
        }

        const store = createStore({ contextFolderPath });
        const contextGraph = store.load();

        if (!contextFolderPath && !contextGraph?.rootPath) {
            console.warn('Skipping analysis due to missing context folder path', { resultMdPath });
            showToast({
                title: 'Context folder required',
                body: 'Set a Context Folder Path in Settings to run analysis.',
                type: 'warning',
            });
            recordEvent({
                contextFolderPath,
                flowId,
                trigger,
                step: 'analysis',
                status: 'skipped',
                summary: 'Analysis skipped',
                detail: 'Missing context folder path.',
                sourcePath: resultMdPath,
            });
            return { skipped: true, reason: 'missing_context_folder' };
        }

        console.log('Starting analysis for result markdown', { resultMdPath, provider, model });
        recordEvent({
            contextFolderPath,
            flowId,
            trigger,
            step: 'analysis',
            status: 'started',
            summary: 'Analysis started',
            sourcePath: resultMdPath,
            metadata: { provider, model },
        });

        let result;
        try {
            result = await runAnalysisImpl({
                resultMdPath,
                contextGraph,
                contextFolderPath,
                provider,
                apiKey,
                model,
            });
        } catch (error) {
            if (error instanceof InvalidLlmProviderApiKeyError) {
                const providerName = formatProviderName(error.provider || provider);
                console.warn('Analysis failed due to invalid LLM API key', {
                    provider: providerName,
                    message: error.message,
                });
                showToast({
                    title: `Invalid ${providerName} API key`,
                    body: 'Update it in Settings and try again.',
                    type: 'error',
                });
                recordEvent({
                    contextFolderPath,
                    flowId,
                    trigger,
                    step: 'analysis',
                    status: 'skipped',
                    summary: 'Analysis skipped',
                    detail: 'Invalid LLM API key.',
                    sourcePath: resultMdPath,
                    metadata: { provider, model },
                });
                return { skipped: true, reason: 'invalid_api_key' };
            }

            recordEvent({
                contextFolderPath,
                flowId,
                trigger,
                step: 'analysis',
                status: 'failed',
                summary: 'Analysis failed',
                detail: error?.message || 'Analysis failed.',
                sourcePath: resultMdPath,
                metadata: { provider, model },
            });
            throw error;
        }

        console.log('Analysis saved', {
            resultMdPath,
            outputPath: result.outputPath,
            relevantNodeId: result.relevantNodeId,
        });
        recordEvent({
            contextFolderPath,
            flowId,
            trigger,
            step: 'analysis',
            status: 'success',
            summary: 'Analysis complete',
            sourcePath: resultMdPath,
            outputPath: result.outputPath,
            metadata: { provider, model, relevantNodeId: result.relevantNodeId },
        });

        const nodeName = result.relevantNodeName || 'General';
        const shortPath = shortenPath(result.outputPath);
        showToast({
            title: 'Analysis Complete',
            body: `Context: ${nodeName}\nSaved: ${shortPath}`,
            type: 'success',
            size: 'large',
            duration: 15000,
            actions: [{ label: 'Open in Folder', action: 'open-in-folder', data: result.outputPath }],
        });

        return result;
    };

const handleAnalysisEvent = createAnalysisHandler();

module.exports = {
    handleAnalysisEvent,
    createAnalysisHandler,
};
