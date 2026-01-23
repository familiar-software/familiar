const { registerSettingsHandlers } = require('./settings');
const { registerContextGraphHandlers, computeSyncStats, parseMaxNodesError } = require('./contextGraph');

/**
 * Registers all IPC handlers for the main process.
 */
function registerIpcHandlers() {
    registerSettingsHandlers();
    registerContextGraphHandlers();
}

module.exports = {
    registerIpcHandlers,
    registerSettingsHandlers,
    registerContextGraphHandlers,
    computeSyncStats,
    parseMaxNodesError,
};
