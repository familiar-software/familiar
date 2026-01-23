const fs = require('node:fs/promises');
const path = require('node:path');
const { GENERAL_ANALYSIS_DIR_NAME } = require('../const');
const { createModelProviderClients } = require('../modelProviders');

const buildSummaryPrompt = ({ resultMarkdown }) =>
    'You are summarizing a Markdown result.\n' +
    'Instructions:\n' +
    '- Provide a concise, high-signal summary of the content.\n' +
    '- Focus on key topics, entities, tasks, and decisions.\n' +
    '- Do not copy the full text verbatim.\n' +
    '\n' +
    'Content:\n' +
    resultMarkdown;

const buildNodeSelectionPrompt = ({ resultMarkdown, nodes }) =>
    'You are selecting the most relevant node from a context graph for the content.\n' +
    'Return JSON only with the shape: {"nodeId": "<id>"} or {"nodeId": null}.\n' +
    'Choose null only if nothing is relevant.\n' +
    '\n' +
    'Content:\n' +
    resultMarkdown +
    '\n\n' +
    'Context graph nodes (id, type, name, relativePath, summary):\n' +
    JSON.stringify(nodes, null, 2);

const createProviderGenerator = ({ provider, apiKey, model } = {}) => {
    const clients = createModelProviderClients({ provider, apiKey, textModel: model });
    return {
        provider: clients.name,
        model: clients.text.model,
        generate: async (prompt) => clients.text.generate(prompt),
    };
};

const createGeminiGenerator = ({ apiKey, model } = {}) =>
    createProviderGenerator({ provider: 'gemini', apiKey, model });

const createMockGenerator = ({ text = 'gibberish', model = 'mock' } = {}) => ({
    model,
    generate: async () => text,
});

const createAnalysisGenerator = (options = {}) => {
    if (process.env.JIMINY_LLM_MOCK === '1') {
        return createMockGenerator({ text: process.env.JIMINY_LLM_MOCK_TEXT || 'gibberish' });
    }

    return createProviderGenerator(options);
};

const summarizeResult = async ({ resultMarkdown, generator }) => {
    const prompt = buildSummaryPrompt({ resultMarkdown });
    const summary = await generator.generate(prompt);
    return summary.trim();
};

const extractJsonObject = (text) => {
    if (!text) return null;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        return null;
    }

    const snippet = text.slice(start, end + 1);
    try {
        return JSON.parse(snippet);
    } catch (error) {
        return null;
    }
};

const buildNodeList = (contextGraph) => {
    const nodes = contextGraph?.nodes || {};
    return Object.values(nodes).map((node) => ({
        id: node.id,
        type: node.type,
        name: node.name,
        relativePath: node.relativePath,
        summary: node.summary || '',
    }));
};

const findRelevantNodeBasedOnContextGraph = async ({ resultMarkdown, contextGraph, generator }) => {
    const nodeList = buildNodeList(contextGraph);
    if (nodeList.length === 0) {
        return null;
    }

    const prompt = buildNodeSelectionPrompt({ resultMarkdown, nodes: nodeList });
    const response = await generator.generate(prompt);
    const parsed = extractJsonObject(response);
    if (!parsed || typeof parsed !== 'object') {
        console.warn('Analysis node selection response invalid; defaulting to no match');
        return null;
    }
    const nodeId = parsed && typeof parsed.nodeId === 'string' ? parsed.nodeId : null;

    if (!nodeId || !contextGraph?.nodes || !contextGraph.nodes[nodeId]) {
        return null;
    }

    return contextGraph.nodes[nodeId];
};

const buildAnalysisFileName = (resultMdPath) => {
    if (!resultMdPath) {
        return 'analysis.md';
    }

    const baseName = path.basename(resultMdPath);
    const parsed = path.parse(baseName);
    const nameWithoutExt = parsed.ext ? parsed.name : parsed.base;
    const extractionSuffix = '-extraction';
    const cleanedName = nameWithoutExt.endsWith(extractionSuffix)
        ? nameWithoutExt.slice(0, -extractionSuffix.length)
        : nameWithoutExt;
    const safeName = cleanedName || 'analysis';

    return `${safeName}-analysis.md`;
};

const resolveAnalysisOutputDir = ({ contextGraph, contextFolderPath, relevantNode }) => {
    const rootPath = contextGraph?.rootPath || contextFolderPath;
    if (!rootPath) {
        throw new Error('Context folder path is required to write analysis output.');
    }

    if (!relevantNode) {
        return { rootPath, outputDir: path.join(rootPath, GENERAL_ANALYSIS_DIR_NAME) };
    }

    const relativePath = relevantNode.relativePath || '';
    const parentRelative = relativePath ? path.dirname(relativePath) : '';
    const normalizedParent = parentRelative === '.' ? '' : parentRelative;
    const baseName =
        relevantNode.type === 'file'
            ? path.basename(relevantNode.name || '', path.extname(relevantNode.name || ''))
            : relevantNode.name || 'context';
    const folderName = `${baseName}-jiminy-extra-context`;

    return {
        rootPath,
        outputDir: path.join(rootPath, normalizedParent, folderName),
    };
};

const buildAnalysisMarkdown = ({ resultMdPath, summary }) => {
    const trimmedSummary = summary.trim();
    return `Raw result: ${resultMdPath}\n\n# Summary\n${trimmedSummary}\n`;
};

const writeAnalysisFile = async ({ outputPath, markdown }) => {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const payload = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
    await fs.writeFile(outputPath, payload, 'utf-8');
    return outputPath;
};

const runAnalysis = async ({
    resultMdPath,
    contextGraph,
    contextFolderPath,
    provider,
    apiKey,
    model,
    generator,
    summarizeFn,
    findRelevantNodeFn,
} = {}) => {
    if (!resultMdPath) {
        throw new Error('Result markdown path is required for analysis.');
    }

    const resultMarkdown = await fs.readFile(resultMdPath, 'utf-8');
    const resolvedGenerator = generator || createAnalysisGenerator({ provider, apiKey, model });
    const summarize = summarizeFn || summarizeResult;
    const findRelevant = findRelevantNodeFn || findRelevantNodeBasedOnContextGraph;

    const summary = await summarize({ resultMarkdown, generator: resolvedGenerator });
    if (!summary) {
        throw new Error('Analysis summary is empty.');
    }

    const relevantNode = await findRelevant({
        resultMarkdown,
        contextGraph,
        generator: resolvedGenerator,
    });

    const { outputDir } = resolveAnalysisOutputDir({
        contextGraph,
        contextFolderPath,
        relevantNode,
    });

    const analysisFileName = buildAnalysisFileName(resultMdPath);
    const outputPath = path.join(outputDir, analysisFileName);
    const markdown = buildAnalysisMarkdown({ resultMdPath, summary });

    await writeAnalysisFile({ outputPath, markdown });

    return {
        outputPath,
        summary,
        relevantNodeId: relevantNode?.id || null,
        outputDir,
    };
};

module.exports = {
    buildSummaryPrompt,
    buildNodeSelectionPrompt,
    createAnalysisGenerator,
    createProviderGenerator,
    createGeminiGenerator,
    createMockGenerator,
    summarizeResult,
    findRelevantNodeBasedOnContextGraph,
    buildAnalysisFileName,
    resolveAnalysisOutputDir,
    buildAnalysisMarkdown,
    writeAnalysisFile,
    runAnalysis,
};
