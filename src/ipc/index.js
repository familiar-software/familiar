const { registerSettingsHandlers } = require('./settings');
const { registerContextGraphHandlers, computeSyncStats, parseMaxNodesError } = require('./contextGraph');
const { registerHistoryHandlers } = require('./history');
const { registerRecordingQueryHandlers } = require('./recordingQuery');
const { registerUpdateHandlers } = require('./updates');

/**
 * Registers all IPC handlers for the main process.
 */
function registerIpcHandlers(options = {}) {
    registerSettingsHandlers({ onSettingsSaved: options.onSettingsSaved });
    registerContextGraphHandlers();
    registerHistoryHandlers();
    registerRecordingQueryHandlers();
    registerUpdateHandlers();
}

module.exports = {
    registerIpcHandlers,
    registerSettingsHandlers,
    registerContextGraphHandlers,
    registerHistoryHandlers,
    registerRecordingQueryHandlers,
    registerUpdateHandlers,
    computeSyncStats,
    parseMaxNodesError,
};
