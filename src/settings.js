const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { SETTINGS_DIR_NAME, SETTINGS_FILE_NAME } = require('./const');
const { normalizeStringArray } = require('./utils/list');
const { resolveAutoCleanupRetentionDays } = require('./storage/auto-cleanup-retention');
const { normalizeCapturePrivacySettings } = require('./screen-stills/capture-privacy');

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
    const hasUpdateLastCheckedAt = Object.prototype.hasOwnProperty.call(settings, 'updateLastCheckedAt');
    const hasStorageAutoCleanupRetentionDays = Object.prototype.hasOwnProperty.call(settings, 'storageAutoCleanupRetentionDays');
    const hasStorageAutoCleanupLastRunAt = Object.prototype.hasOwnProperty.call(settings, 'storageAutoCleanupLastRunAt');
    const hasAlwaysRecordWhenActive = Object.prototype.hasOwnProperty.call(settings, 'alwaysRecordWhenActive');
    const hasWizardCompleted = Object.prototype.hasOwnProperty.call(settings, 'wizardCompleted');
    const hasSkillInstaller = Object.prototype.hasOwnProperty.call(settings, 'skillInstaller');
    const hasCapturePrivacy = Object.prototype.hasOwnProperty.call(settings, 'capturePrivacy');
    const hasFamiliarSkillInstalledVersion = Object.prototype.hasOwnProperty.call(
        settings,
        'familiarSkillInstalledVersion'
    );
    const existingSkillInstaller =
        existing && typeof existing.skillInstaller === 'object' ? existing.skillInstaller : {};
    const existingCapturePrivacy =
        existing && typeof existing.capturePrivacy === 'object' ? existing.capturePrivacy : {};
    const contextFolderPath = hasContextFolderPath
        ? typeof settings.contextFolderPath === 'string'
            ? settings.contextFolderPath
            : ''
        : typeof existing.contextFolderPath === 'string'
        ? existing.contextFolderPath
        : '';

    fs.mkdirSync(settingsDir, { recursive: true });
    const payload = { contextFolderPath };

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

    if (hasCapturePrivacy) {
        payload.capturePrivacy = normalizeCapturePrivacySettings(settings.capturePrivacy);
    } else if (Object.keys(existingCapturePrivacy).length > 0) {
        payload.capturePrivacy = normalizeCapturePrivacySettings(existingCapturePrivacy);
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

const validateWritableDirectoryPath = (directoryPath, options = {}) => {
    const requiredMessage = typeof options.requiredMessage === 'string' && options.requiredMessage.trim().length > 0
        ? options.requiredMessage
        : 'Directory path is required.';

    if (typeof directoryPath !== 'string' || directoryPath.trim().length === 0) {
        return { ok: false, message: requiredMessage };
    }

    const resolvedPath = path.resolve(directoryPath);

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

const validateContextFolderPath = (contextFolderPath) =>
    validateWritableDirectoryPath(contextFolderPath, {
        requiredMessage: 'Context Folder Path is required.'
    });

// The default parent directory for Familiar's storage. With this default,
// the storage dir resolves to ~/familiar/ — sibling of the hidden
// ~/.familiar/ settings dir, easy to find in Finder, no decision required
// from the user. Advanced users can override by picking a different
// folder via the wizard.
const resolveDefaultContextFolderPath = () => os.homedir();

module.exports = {
    loadSettings,
    saveSettings,
    validateWritableDirectoryPath,
    validateContextFolderPath,
    resolveSettingsDir,
    resolveSettingsPath,
    resolveDefaultContextFolderPath,
};
