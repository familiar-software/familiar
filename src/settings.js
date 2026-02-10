const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { SETTINGS_DIR_NAME, SETTINGS_FILE_NAME } = require('./const');
const { DEFAULT_RECORDING_HOTKEY } = require('./hotkeys');

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
    const hasStillsMarkdownExtractorType = Object.prototype.hasOwnProperty.call(settings, 'stillsMarkdownExtractorType');
    const hasUpdateLastCheckedAt = Object.prototype.hasOwnProperty.call(settings, 'updateLastCheckedAt');
    const hasRecordingHotkey = Object.prototype.hasOwnProperty.call(settings, 'recordingHotkey');
    const hasAlwaysRecordWhenActive = Object.prototype.hasOwnProperty.call(settings, 'alwaysRecordWhenActive');
    const hasSkillInstaller = Object.prototype.hasOwnProperty.call(settings, 'skillInstaller');
    const existingStillsExtractor =
        existing && typeof existing.stills_markdown_extractor === 'object' ? existing.stills_markdown_extractor : {};
    const existingStillsExtractorLlmProvider =
        existingStillsExtractor && typeof existingStillsExtractor.llm_provider === 'object'
            ? existingStillsExtractor.llm_provider
            : {};
    const existingProvider = existingStillsExtractorLlmProvider;
    const existingSkillInstaller =
        existing && typeof existing.skillInstaller === 'object' ? existing.skillInstaller : {};
    const contextFolderPath = hasContextFolderPath
        ? typeof settings.contextFolderPath === 'string'
            ? settings.contextFolderPath
            : ''
        : typeof existing.contextFolderPath === 'string'
        ? existing.contextFolderPath
        : '';

    fs.mkdirSync(settingsDir, { recursive: true });
    const payload = { contextFolderPath };
    const hasAnyLlmProviderField =
        hasLlmProviderApiKey || hasLlmProviderName || hasLlmProviderTextModel || hasLlmProviderVisionModel;

    if (hasStillsMarkdownExtractorType) {
        const rawType =
            typeof settings.stillsMarkdownExtractorType === 'string' ? settings.stillsMarkdownExtractorType : '';
        const normalized = rawType.trim().toLowerCase();
        const nextType = normalized === 'apple_vision_ocr' ? 'apple_vision_ocr' : 'llm';
        payload.stills_markdown_extractor = { ...existingStillsExtractor, type: nextType };
        if (nextType === 'apple_vision_ocr') {
            if (typeof payload.stills_markdown_extractor.level !== 'string') {
                payload.stills_markdown_extractor.level = 'accurate';
            }
            if (!Object.prototype.hasOwnProperty.call(payload.stills_markdown_extractor, 'minConfidence')) {
                payload.stills_markdown_extractor.minConfidence = 0.0;
            }
            if (!Object.prototype.hasOwnProperty.call(payload.stills_markdown_extractor, 'noCorrection')) {
                payload.stills_markdown_extractor.noCorrection = false;
            }
            if (!Object.prototype.hasOwnProperty.call(payload.stills_markdown_extractor, 'languages')) {
                payload.stills_markdown_extractor.languages = [];
            }
        }
    } else if (Object.keys(existingStillsExtractor).length > 0 || hasAnyLlmProviderField) {
        payload.stills_markdown_extractor = { ...existingStillsExtractor };
    }

    if (hasAnyLlmProviderField) {
        if (!payload.stills_markdown_extractor || typeof payload.stills_markdown_extractor !== 'object') {
            payload.stills_markdown_extractor = { type: 'llm' };
        }
        payload.stills_markdown_extractor.llm_provider = { ...existingProvider };
        if (hasLlmProviderApiKey) {
            payload.stills_markdown_extractor.llm_provider.api_key =
                typeof settings.llmProviderApiKey === 'string' ? settings.llmProviderApiKey : '';
        }
        if (hasLlmProviderName) {
            payload.stills_markdown_extractor.llm_provider.provider =
                typeof settings.llmProviderName === 'string' ? settings.llmProviderName : '';
        }
        if (hasLlmProviderTextModel) {
            payload.stills_markdown_extractor.llm_provider.text_model =
                typeof settings.llmProviderTextModel === 'string' ? settings.llmProviderTextModel : '';
        }
        if (hasLlmProviderVisionModel) {
            payload.stills_markdown_extractor.llm_provider.vision_model =
                typeof settings.llmProviderVisionModel === 'string' ? settings.llmProviderVisionModel : '';
        }
    } else if (Object.keys(existingProvider).length > 0) {
        if (!payload.stills_markdown_extractor || typeof payload.stills_markdown_extractor !== 'object') {
            payload.stills_markdown_extractor = { ...existingStillsExtractor };
        }
        payload.stills_markdown_extractor.llm_provider = { ...existingProvider };
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

    if (hasSkillInstaller) {
        const raw = settings && typeof settings.skillInstaller === 'object' ? settings.skillInstaller : {};
        payload.skillInstaller = {
            harness: typeof raw.harness === 'string' ? raw.harness : '',
            installPath: typeof raw.installPath === 'string' ? raw.installPath : '',
        };
    } else if (Object.keys(existingSkillInstaller).length > 0) {
        payload.skillInstaller = { ...existingSkillInstaller };
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
