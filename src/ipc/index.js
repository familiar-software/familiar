const { registerSettingsHandlers } = require('./settings');
const { registerStillsHandlers } = require('./stills');
const { registerUpdateHandlers } = require('./updates');
const { registerSkillHandlers } = require('./skills');
const { registerLogsHandlers } = require('./logs');
const { registerStorageHandlers } = require('./storage');

/**
 * Registers all IPC handlers for the main process.
 */
function registerIpcHandlers(options = {}) {
    registerSettingsHandlers({ onSettingsSaved: options.onSettingsSaved });
    registerStillsHandlers();
    registerUpdateHandlers();
    registerSkillHandlers();
    registerLogsHandlers();
    registerStorageHandlers();
}

module.exports = {
    registerIpcHandlers,
    registerSettingsHandlers,
    registerStillsHandlers,
    registerUpdateHandlers,
    registerSkillHandlers,
    registerLogsHandlers,
    registerStorageHandlers,
};
