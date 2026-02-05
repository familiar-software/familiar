const { registerSettingsHandlers } = require('./settings');
const { registerRecordingQueryHandlers } = require('./recordingQuery');
const { registerUpdateHandlers } = require('./updates');

/**
 * Registers all IPC handlers for the main process.
 */
function registerIpcHandlers(options = {}) {
    registerSettingsHandlers({ onSettingsSaved: options.onSettingsSaved });
    registerRecordingQueryHandlers();
    registerUpdateHandlers();
}

module.exports = {
    registerIpcHandlers,
    registerSettingsHandlers,
    registerRecordingQueryHandlers,
    registerUpdateHandlers,
};
