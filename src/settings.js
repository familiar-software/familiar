const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { SETTINGS_DIR_NAME, SETTINGS_FILE_NAME } = require('./const');
const { normalizeStringArray } = require('./utils/list');
const { resolveAutoCleanupRetentionDays } = require('./storage/auto-cleanup-retention');

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const areDeepEqual = (left, right) => {
    if (left === right) {
        return true;
    }

    if (!isPlainObject(left) && !Array.isArray(left) && typeof left !== 'object') {
        return left === right;
    }

    if (!isPlainObject(right) && !Array.isArray(right) && typeof right !== 'object') {
        return left === right;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) {
            return false;
        }
        for (let index = 0; index < left.length; index += 1) {
            if (!areDeepEqual(left[index], right[index])) {
                return false;
            }
        }
        return true;
    }

    if (isPlainObject(left) && isPlainObject(right)) {
        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        if (leftKeys.length !== rightKeys.length) {
            return false;
        }
        for (let index = 0; index < leftKeys.length; index += 1) {
            const key = leftKeys[index];
            if (key !== rightKeys[index]) {
                return false;
            }
            if (!areDeepEqual(left[key], right[key])) {
                return false;
            }
        }
        return true;
    }

    return false;
};

const resolveSettingsDir = (settingsDir) =>
    settingsDir || process.env.FAMILIAR_SETTINGS_DIR || path.join(os.homedir(), SETTINGS_DIR_NAME);

const resolveSettingsPath = (options = {}) => path.join(resolveSettingsDir(options.settingsDir), SETTINGS_FILE_NAME);

const normalizeSkillInstallerHarnessList = (raw = {}) => {
    const legacyHarnesses = Array.isArray(raw.harnesses) ? raw.harnesses : [];
    const directHarnesses = Array.isArray(raw.harness) ? raw.harness : [raw.harness];
    return normalizeStringArray([...directHarnesses, ...legacyHarnesses], {
        lowerCase: true
    });
};

const normalizeSkillInstallerPathList = (raw = {}, harnesses = []) => {
    const directPaths = [];
    if (Array.isArray(raw.installPath)) {
        directPaths.push(...raw.installPath);
    } else if (typeof raw.installPath === 'string') {
        directPaths.push(raw.installPath);
    }

    const byHarness = raw && typeof raw.installPaths === 'object' ? raw.installPaths : {};
    const normalized = [];
    harnesses.forEach((harness, index) => {
        const direct = typeof directPaths[index] === 'string' ? directPaths[index] : '';
        const mapped = typeof byHarness[harness] === 'string' ? byHarness[harness] : '';
        const value = (direct || mapped || '').trim();
        normalized.push(value);
    });
    return normalized;
};

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
    const hasStorageAutoCleanupRetentionDays = Object.prototype.hasOwnProperty.call(settings, 'storageAutoCleanupRetentionDays');
    const hasStorageAutoCleanupLastRunAt = Object.prototype.hasOwnProperty.call(settings, 'storageAutoCleanupLastRunAt');
    const hasAlwaysRecordWhenActive = Object.prototype.hasOwnProperty.call(settings, 'alwaysRecordWhenActive');
    const hasWizardCompleted = Object.prototype.hasOwnProperty.call(settings, 'wizardCompleted');
    const hasSkillInstaller = Object.prototype.hasOwnProperty.call(settings, 'skillInstaller');
    const hasHeartbeats = Object.prototype.hasOwnProperty.call(settings, 'heartbeats');
    const hasFamiliarSkillInstalledVersion = Object.prototype.hasOwnProperty.call(
        settings,
        'familiarSkillInstalledVersion'
    );
    const existingStillsExtractor =
        existing && typeof existing.stills_markdown_extractor === 'object' ? existing.stills_markdown_extractor : {};
    const existingStillsExtractorLlmProvider =
        existingStillsExtractor && typeof existingStillsExtractor.llm_provider === 'object'
            ? existingStillsExtractor.llm_provider
            : {};
    const existingProvider = existingStillsExtractorLlmProvider;
    const existingSkillInstaller =
        existing && typeof existing.skillInstaller === 'object' ? existing.skillInstaller : {};
    const existingHeartbeats = existing && typeof existing.heartbeats === 'object' ? existing.heartbeats : {};
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

    if (hasUpdateLastCheckedAt) {
        payload.updateLastCheckedAt =
            typeof settings.updateLastCheckedAt === 'number' ? settings.updateLastCheckedAt : null;
    } else if (typeof existing.updateLastCheckedAt === 'number') {
        payload.updateLastCheckedAt = existing.updateLastCheckedAt;
    }

    if (hasStorageAutoCleanupRetentionDays) {
        payload.storageAutoCleanupRetentionDays = resolveAutoCleanupRetentionDays(
            settings.storageAutoCleanupRetentionDays
        );
    } else if (typeof existing.storageAutoCleanupRetentionDays === 'number') {
        payload.storageAutoCleanupRetentionDays = resolveAutoCleanupRetentionDays(
            existing.storageAutoCleanupRetentionDays
        );
    }

    if (hasStorageAutoCleanupLastRunAt) {
        payload.storageAutoCleanupLastRunAt =
            typeof settings.storageAutoCleanupLastRunAt === 'number' &&
            Number.isFinite(settings.storageAutoCleanupLastRunAt) &&
            settings.storageAutoCleanupLastRunAt >= 0
                ? Math.floor(settings.storageAutoCleanupLastRunAt)
                : null;
    } else if (typeof existing.storageAutoCleanupLastRunAt === 'number') {
        payload.storageAutoCleanupLastRunAt = existing.storageAutoCleanupLastRunAt;
    }

    if (hasAlwaysRecordWhenActive) {
        payload.alwaysRecordWhenActive = settings.alwaysRecordWhenActive === true;
    } else if (typeof existing.alwaysRecordWhenActive === 'boolean') {
        payload.alwaysRecordWhenActive = existing.alwaysRecordWhenActive;
    }

    if (hasWizardCompleted) {
        payload.wizardCompleted = settings.wizardCompleted === true;
    } else if (typeof existing.wizardCompleted === 'boolean') {
        payload.wizardCompleted = existing.wizardCompleted;
    }

    if (hasSkillInstaller) {
        const raw = settings && typeof settings.skillInstaller === 'object' ? settings.skillInstaller : {};
        const harnesses = normalizeSkillInstallerHarnessList(raw);
        const installPaths = normalizeSkillInstallerPathList(raw, harnesses);
        payload.skillInstaller = {
            harness: harnesses,
            installPath: installPaths,
        };
    } else if (Object.keys(existingSkillInstaller).length > 0) {
        const harnesses = normalizeSkillInstallerHarnessList(existingSkillInstaller);
        const installPaths = normalizeSkillInstallerPathList(existingSkillInstaller, harnesses);
        payload.skillInstaller = { harness: harnesses, installPath: installPaths };
    }

    if (hasHeartbeats) {
        const raw = settings && typeof settings.heartbeats === 'object' ? settings.heartbeats : {};
        const items = Array.isArray(raw?.items) ? raw.items : [];
        payload.heartbeats = { items };
    } else if (Array.isArray(existingHeartbeats.items)) {
        payload.heartbeats = { items: existingHeartbeats.items };
    }

    if (hasFamiliarSkillInstalledVersion) {
        payload.familiarSkillInstalledVersion = typeof settings.familiarSkillInstalledVersion === 'string'
            ? settings.familiarSkillInstalledVersion
            : null;
    } else if (Object.prototype.hasOwnProperty.call(existing, 'familiarSkillInstalledVersion')) {
        payload.familiarSkillInstalledVersion = existing.familiarSkillInstalledVersion;
    }

    const isNoOp = areDeepEqual(existing || {}, payload);

    if (isNoOp) {
        return null;
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
