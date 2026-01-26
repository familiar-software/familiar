const { registerSettingsHandlers } = require('./settings');
const { registerContextGraphHandlers, computeSyncStats, parseMaxNodesError } = require('./contextGraph');
const { registerHistoryHandlers } = require('./history');

/**
 * Registers all IPC handlers for the main process.
 */
function registerIpcHandlers() {
    registerSettingsHandlers();
    registerContextGraphHandlers();
    registerHistoryHandlers();
}

module.exports = {
    registerIpcHandlers,
    registerSettingsHandlers,
    registerContextGraphHandlers,
    registerHistoryHandlers,
    computeSyncStats,
    parseMaxNodesError,
};
