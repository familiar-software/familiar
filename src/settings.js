const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { SETTINGS_DIR_NAME, SETTINGS_FILE_NAME } = require('./const');
const { DEFAULT_CAPTURE_HOTKEY, DEFAULT_CLIPBOARD_HOTKEY, DEFAULT_RECORDING_HOTKEY } = require('./hotkeys');

const resolveSettingsDir = (settingsDir) =>
    settingsDir || process.env.JIMINY_SETTINGS_DIR || path.join(os.homedir(), SETTINGS_DIR_NAME);

const resolveSettingsPath = (options = {}) => path.join(resolveSettingsDir(options.settingsDir), SETTINGS_FILE_NAME);

const loadSettings = (options = {}) => {
    const settingsPath = resolveSettingsPath(options);

    try {
        if (!fs.existsSync(settingsPath)) {
            return {};
        }

        const raw = fs.readFileSync(settingsPath, 'utf-8');
        if (!raw.trim()) {
            return {};
        }

        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') {
            return {};
        }

        return data;
    } catch (error) {
        const loadError = {
            message: error && error.message ? error.message : 'Unknown settings load error.',
            code: error && error.code ? error.code : null,
            path: settingsPath,
        };
        console.error('Failed to load settings', loadError);
        return { __loadError: loadError };
    }
};

const saveSettings = (settings, options = {}) => {
    const settingsDir = resolveSettingsDir(options.settingsDir);
    const settingsPath = path.join(settingsDir, SETTINGS_FILE_NAME);
    const existing = loadSettings(options);
    const hasContextFolderPath = Object.prototype.hasOwnProperty.call(settings, 'contextFolderPath');
    const hasLlmProviderApiKey = Object.prototype.hasOwnProperty.call(settings, 'llmProviderApiKey');
    const hasLlmProviderName = Object.prototype.hasOwnProperty.call(settings, 'llmProviderName');
    const hasLlmProviderTextModel = Object.prototype.hasOwnProperty.call(settings, 'llmProviderTextModel');
    const hasLlmProviderVisionModel = Object.prototype.hasOwnProperty.call(settings, 'llmProviderVisionModel');
    const hasExclusions = Object.prototype.hasOwnProperty.call(settings, 'exclusions');
    const hasCaptureHotkey = Object.prototype.hasOwnProperty.call(settings, 'captureHotkey');
    const hasClipboardHotkey = Object.prototype.hasOwnProperty.call(settings, 'clipboardHotkey');
    const hasUpdateLastCheckedAt = Object.prototype.hasOwnProperty.call(settings, 'updateLastCheckedAt');
    const hasRecordingHotkey = Object.prototype.hasOwnProperty.call(settings, 'recordingHotkey');
    const hasAlwaysRecordWhenActive = Object.prototype.hasOwnProperty.call(settings, 'alwaysRecordWhenActive');
    const existingProvider = existing && typeof existing.llm_provider === 'object' ? existing.llm_provider : {};
    const contextFolderPath = hasContextFolderPath
        ? typeof settings.contextFolderPath === 'string'
            ? settings.contextFolderPath
            : ''
        : typeof existing.contextFolderPath === 'string'
        ? existing.contextFolderPath
        : '';

    fs.mkdirSync(settingsDir, { recursive: true });
    const payload = { contextFolderPath };
    if (hasLlmProviderApiKey || hasLlmProviderName || hasLlmProviderTextModel || hasLlmProviderVisionModel) {
        payload.llm_provider = { ...existingProvider };
        if (hasLlmProviderApiKey) {
            payload.llm_provider.api_key =
                typeof settings.llmProviderApiKey === 'string' ? settings.llmProviderApiKey : '';
        }
        if (hasLlmProviderName) {
            payload.llm_provider.provider =
                typeof settings.llmProviderName === 'string' ? settings.llmProviderName : '';
        }
        if (hasLlmProviderTextModel) {
            payload.llm_provider.text_model =
                typeof settings.llmProviderTextModel === 'string' ? settings.llmProviderTextModel : '';
        }
        if (hasLlmProviderVisionModel) {
            payload.llm_provider.vision_model =
                typeof settings.llmProviderVisionModel === 'string' ? settings.llmProviderVisionModel : '';
        }
    } else if (Object.keys(existingProvider).length > 0) {
        payload.llm_provider = { ...existingProvider };
    }

    if (hasExclusions) {
        payload.exclusions = Array.isArray(settings.exclusions) ? settings.exclusions : [];
    } else if (Array.isArray(existing.exclusions)) {
        payload.exclusions = existing.exclusions;
    }

    if (hasCaptureHotkey) {
        payload.captureHotkey =
            typeof settings.captureHotkey === 'string' ? settings.captureHotkey : DEFAULT_CAPTURE_HOTKEY;
    } else if (typeof existing.captureHotkey === 'string') {
        payload.captureHotkey = existing.captureHotkey;
    }

    if (hasClipboardHotkey) {
        payload.clipboardHotkey =
            typeof settings.clipboardHotkey === 'string' ? settings.clipboardHotkey : DEFAULT_CLIPBOARD_HOTKEY;
    } else if (typeof existing.clipboardHotkey === 'string') {
        payload.clipboardHotkey = existing.clipboardHotkey;
    }

    if (hasRecordingHotkey) {
        payload.recordingHotkey =
            typeof settings.recordingHotkey === 'string' ? settings.recordingHotkey : DEFAULT_RECORDING_HOTKEY;
    } else if (typeof existing.recordingHotkey === 'string') {
        payload.recordingHotkey = existing.recordingHotkey;
    }

    if (hasUpdateLastCheckedAt) {
        payload.updateLastCheckedAt =
            typeof settings.updateLastCheckedAt === 'number' ? settings.updateLastCheckedAt : null;
    } else if (typeof existing.updateLastCheckedAt === 'number') {
        payload.updateLastCheckedAt = existing.updateLastCheckedAt;
    }

    if (hasAlwaysRecordWhenActive) {
        payload.alwaysRecordWhenActive = settings.alwaysRecordWhenActive === true;
    } else if (typeof existing.alwaysRecordWhenActive === 'boolean') {
        payload.alwaysRecordWhenActive = existing.alwaysRecordWhenActive;
    }

    fs.writeFileSync(settingsPath, JSON.stringify(payload, null, 2), 'utf-8');

    return settingsPath;
};

const validateContextFolderPath = (contextFolderPath) => {
    if (typeof contextFolderPath !== 'string' || contextFolderPath.trim().length === 0) {
        return { ok: false, message: 'Context Folder Path is required.' };
    }

    const resolvedPath = path.resolve(contextFolderPath);

    try {
        if (!fs.existsSync(resolvedPath)) {
            return { ok: false, message: 'Selected path does not exist.' };
        }

        const stats = fs.statSync(resolvedPath);
        if (!stats.isDirectory()) {
            return { ok: false, message: 'Selected path is not a directory.' };
        }

        fs.accessSync(resolvedPath, fs.constants.R_OK | fs.constants.W_OK);
        return { ok: true, path: resolvedPath };
    } catch (error) {
        return { ok: false, message: 'Selected path is not readable or writable.' };
    }
};

module.exports = {
    loadSettings,
    saveSettings,
    validateContextFolderPath,
    resolveSettingsDir,
    resolveSettingsPath,
};
