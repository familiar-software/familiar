const { ipcMain } = require('electron');
const { loadSettings, validateContextFolderPath } = require('../settings');
const { JsonContextGraphStore, createSummarizer, syncContextGraph } = require('../context-graph');
const { showToast } = require('../toast');
const { ExhaustedLlmProviderError } = require('../modelProviders');
const { constructContextGraphSkeleton, MAX_NODES } = require('../context-graph/graphSkeleton');

/**
 * Registers IPC handlers for context graph operations.
 */
function registerContextGraphHandlers() {
    ipcMain.handle('contextGraph:sync', handleSync);
    ipcMain.handle('contextGraph:prune', handlePrune);
    ipcMain.handle('contextGraph:status', handleStatus);
    console.log('Context graph IPC handlers registered');
}

/**
 * Computes sync stats by comparing stored graph nodes to current scan nodes.
 * @param {Object|null} storedGraph - The previously saved graph
 * @param {Object} scanResult - The result from constructContextGraphSkeleton
 * @returns {{ synced: number, outOfSync: number, new: number, total: number }}
 */
function computeSyncStats(storedGraph, scanResult) {
    const storedNodes = storedGraph?.nodes || {};
    const currentNodes = scanResult.nodes || {};
    const total = scanResult.counts.files + scanResult.counts.folders;

    let synced = 0;
    let outOfSync = 0;
    let newNodes = 0;

    for (const nodeId of Object.keys(currentNodes)) {
        const currentNode = currentNodes[nodeId];
        const storedNode = storedNodes[nodeId];

        if (!storedNode) {
            newNodes += 1;
        } else if (
            currentNode.contentHash &&
            storedNode.contentHash &&
            currentNode.contentHash === storedNode.contentHash
        ) {
            synced += 1;
        } else {
            outOfSync += 1;
        }
    }

    return { synced, outOfSync, new: newNodes, total };
}

/**
 * Parses an error to check if it's a MAX_NODES exceeded error.
 * @param {Error} error
 * @returns {{ maxNodesExceeded: boolean, totalNodes: number }}
 */
function parseMaxNodesError(error) {
    const message = error?.message || '';
    const match = /Context graph has (\d+) nodes, exceeding MAX_NODES/.exec(message);
    if (!match) {
        return { maxNodesExceeded: false, totalNodes: 0 };
    }

    return {
        maxNodesExceeded: true,
        totalNodes: Number(match[1]),
    };
}

async function handleSync(event) {
    const settings = loadSettings();
    const contextFolderPath = settings.contextFolderPath || '';
    const llmProviderName = settings?.llm_provider?.provider || '';
    const llmProviderApiKey = settings?.llm_provider?.api_key || '';
    const textModel =
        typeof settings?.llm_provider?.text_model === 'string' && settings.llm_provider.text_model.trim()
            ? settings.llm_provider.text_model
            : undefined;
    const exclusions = Array.isArray(settings.exclusions) ? settings.exclusions : [];
    const validation = validateContextFolderPath(contextFolderPath);

    if (!validation.ok) {
        console.warn('Context graph sync failed validation', { message: validation.message });
        return { ok: false, message: validation.message };
    }

    try {
        if (!llmProviderName) {
            return { ok: false, message: 'LLM provider is not configured. Set it in Settings.' };
        }
        if (process.env.JIMINY_LLM_MOCK !== '1' && !llmProviderApiKey) {
            return { ok: false, message: 'LLM API key is not configured. Set it in Settings.' };
        }

        const store = new JsonContextGraphStore({ contextFolderPath: validation.path });
        const summarizer = createSummarizer({
            provider: llmProviderName,
            apiKey: llmProviderApiKey,
            textModel,
        });
        const result = await syncContextGraph({
            rootPath: validation.path,
            store,
            summarizer,
            exclusions,
            onProgress: (progress) => {
                event.sender.send('contextGraph:progress', progress);
            },
        });
        console.log('context graph sync errors', result.errors);

        return {
            ok: true,
            graphPath: store.getPath(),
            counts: result.graph.counts,
            errors: result.errors,
            warnings: result.warnings,
            ignores: result.ignores,
            ignoredFiles: result.ignoredFiles,
        };
    } catch (error) {
        console.error('Context graph sync failed', error);
        if (error instanceof ExhaustedLlmProviderError) {
            showToast({
                title: 'LLM provider exhausted',
                body: 'Your LLM provider is rate limited. Please wait and try again.',
                type: 'warning',
            });
            return { ok: false, message: 'LLM provider rate limit exhausted. Please try again later.' };
        }
        return { ok: false, message: error.message || 'Failed to sync context graph.' };
    }
}

function handlePrune() {
    const settings = loadSettings();
    const contextFolderPath = settings.contextFolderPath || '';
    if (!contextFolderPath) {
        console.warn('Context graph prune skipped: missing context folder path');
        return { ok: true, deleted: false, graphPath: null };
    }

    const validation = validateContextFolderPath(contextFolderPath);
    if (!validation.ok) {
        console.warn('Context graph prune skipped: invalid context folder path', { message: validation.message });
        return { ok: true, deleted: false, graphPath: null };
    }

    const store = new JsonContextGraphStore({ contextFolderPath: validation.path });
    const graphPath = store.getPath();

    console.log('Pruning context graph', { path: graphPath });

    try {
        const result = store.delete();
        if (result.deleted) {
            console.log('Context graph pruned', { path: graphPath });
        } else {
            console.log('Context graph file not found', { path: graphPath });
        }
        return { ok: true, deleted: result.deleted, graphPath };
    } catch (error) {
        console.error('Failed to prune context graph', error);
        return { ok: false, message: error.message || 'Failed to prune context graph.' };
    }
}

async function handleStatus(_event, payload = {}) {
    const settings = loadSettings();
    const contextFolderPath =
        typeof payload?.contextFolderPath === 'string' ? payload.contextFolderPath : settings.contextFolderPath || '';
    const exclusions = Array.isArray(payload?.exclusions)
        ? payload.exclusions
        : Array.isArray(settings.exclusions)
        ? settings.exclusions
        : [];

    const emptyStatus = {
        ok: true,
        syncedNodes: 0,
        outOfSyncNodes: 0,
        newNodes: 0,
        totalNodes: 0,
        ignoredFiles: 0,
        maxNodesExceeded: false,
    };

    if (!contextFolderPath) {
        return emptyStatus;
    }

    const validation = validateContextFolderPath(contextFolderPath);
    if (!validation.ok) {
        return emptyStatus;
    }

    const store = new JsonContextGraphStore({ contextFolderPath: validation.path });
    const storedGraph = store.load();
    const effectiveExclusions = Array.from(new Set(exclusions.filter(Boolean)));

    try {
        const scanResult = constructContextGraphSkeleton(validation.path, {
            maxNodes: MAX_NODES,
            exclusions: effectiveExclusions,
            logger: console,
        });

        const stats = computeSyncStats(storedGraph, scanResult);
        const ignoredFiles = Array.isArray(scanResult.ignores)
            ? scanResult.ignores.filter((ignore) => ignore?.type === 'file').length
            : 0;
        return {
            ok: true,
            syncedNodes: stats.synced,
            outOfSyncNodes: stats.outOfSync,
            newNodes: stats.new,
            totalNodes: stats.total,
            ignoredFiles,
            maxNodesExceeded: false,
        };
    } catch (error) {
        const maxNodes = parseMaxNodesError(error);
        if (maxNodes.maxNodesExceeded) {
            return {
                ok: false,
                syncedNodes: 0,
                outOfSyncNodes: 0,
                newNodes: 0,
                totalNodes: maxNodes.totalNodes,
                maxNodesExceeded: true,
                message: error.message || `Context graph exceeds MAX_NODES (${MAX_NODES}).`,
            };
        }

        console.error('Failed to compute context graph status', error);
        return {
            ok: false,
            syncedNodes: 0,
            outOfSyncNodes: 0,
            newNodes: 0,
            totalNodes: 0,
            maxNodesExceeded: false,
            message: error.message || 'Failed to check context graph status.',
        };
    }
}

module.exports = {
    registerContextGraphHandlers,
    computeSyncStats,
    parseMaxNodesError,
};
