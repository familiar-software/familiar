const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const { loadSettings, resolveSettingsPath, saveSettings, validateContextFolderPath } = require('../settings');
const { DEFAULT_RECORDING_HOTKEY } = require('../hotkeys');
const { getScreenRecordingPermissionStatus, openScreenRecordingSettings } = require('../screen-capture/permissions');
const { resolveHarnessSkillPath } = require('../skills/installer');

let onSettingsSaved = null;

function readAppVersion() {
    try {
        return app.getVersion();
    } catch (error) {
        console.error('Failed to read app version for settings payload', error);
        return 'unknown';
    }
}

/**
 * Registers IPC handlers for settings operations.
 */
function registerSettingsHandlers(options = {}) {
    onSettingsSaved = typeof options.onSettingsSaved === 'function' ? options.onSettingsSaved : null;
    ipcMain.handle('settings:get', handleGetSettings);
    ipcMain.handle('settings:save', handleSaveSettings);
    ipcMain.handle('settings:pickContextFolder', handlePickContextFolder);
    ipcMain.handle('settings:checkScreenRecordingPermission', handleCheckScreenRecordingPermission);
    ipcMain.handle('settings:openScreenRecordingSettings', handleOpenScreenRecordingSettings);
    console.log('Settings IPC handlers registered');
}

function handleGetSettings() {
    const appVersion = readAppVersion();
    try {
        const settingsPath = resolveSettingsPath();
        const isFirstRun = !fs.existsSync(settingsPath);
        const settings = loadSettings();
        const contextFolderPath = settings.contextFolderPath || '';
        const llmProviderName = settings?.stills_markdown_extractor?.llm_provider?.provider || '';
        const llmProviderApiKey = settings?.stills_markdown_extractor?.llm_provider?.api_key || '';
        const stillsMarkdownExtractorType = (() => {
            const type = settings?.stills_markdown_extractor?.type;
            if (typeof type === 'string' && type.trim()) {
                return type;
            }
            // If the user configured a provider but never set the extractor type, assume cloud.
            if (llmProviderName || llmProviderApiKey) {
                return 'llm';
            }
            return 'apple_vision_ocr';
        })();
        const recordingHotkey = typeof settings.recordingHotkey === 'string' ? settings.recordingHotkey : DEFAULT_RECORDING_HOTKEY;
        const alwaysRecordWhenActive = settings.alwaysRecordWhenActive === true;
        const skillInstallerHarness = typeof settings?.skillInstaller?.harness === 'string' ? settings.skillInstaller.harness : '';
        const skillInstallerInstallPath =
            typeof settings?.skillInstaller?.installPath === 'string' ? settings.skillInstaller.installPath : '';
        let validationMessage = '';

        if (contextFolderPath) {
            const validation = validateContextFolderPath(contextFolderPath);
            if (!validation.ok) {
                validationMessage = validation.message;
                console.warn('Stored context folder path is invalid', {
                    contextFolderPath,
                    message: validationMessage,
                });
            }
        }

        return {
            contextFolderPath,
            validationMessage,
            llmProviderName,
            llmProviderApiKey,
            stillsMarkdownExtractorType,
            recordingHotkey,
            alwaysRecordWhenActive,
            skillInstaller: {
                harness: skillInstallerHarness,
                installPath: skillInstallerInstallPath,
            },
            appVersion,
            isFirstRun
        };
    } catch (error) {
        console.error('Failed to load settings', error);
        return {
            contextFolderPath: '',
            validationMessage: 'Failed to load settings.',
            llmProviderName: '',
            llmProviderApiKey: '',
            stillsMarkdownExtractorType: 'apple_vision_ocr',
            recordingHotkey: DEFAULT_RECORDING_HOTKEY,
            alwaysRecordWhenActive: false,
            skillInstaller: { harness: '', installPath: '' },
            appVersion,
            isFirstRun: false
        };
    }
}

function handleSaveSettings(_event, payload) {
    const hasContextFolderPath = Object.prototype.hasOwnProperty.call(payload || {}, 'contextFolderPath');
    const hasLlmProviderApiKey = Object.prototype.hasOwnProperty.call(payload || {}, 'llmProviderApiKey');
    const hasLlmProviderName = Object.prototype.hasOwnProperty.call(payload || {}, 'llmProviderName');
    const hasStillsMarkdownExtractorType = Object.prototype.hasOwnProperty.call(payload || {}, 'stillsMarkdownExtractorType');
    const hasAlwaysRecordWhenActive = Object.prototype.hasOwnProperty.call(payload || {}, 'alwaysRecordWhenActive');
    const hasRecordingHotkey = Object.prototype.hasOwnProperty.call(payload || {}, 'recordingHotkey');
    const hasSkillInstaller = Object.prototype.hasOwnProperty.call(payload || {}, 'skillInstaller');
    const settingsPayload = {};

    if (
        !hasContextFolderPath &&
        !hasLlmProviderApiKey &&
        !hasLlmProviderName &&
        !hasStillsMarkdownExtractorType &&
        !hasAlwaysRecordWhenActive &&
        !hasRecordingHotkey &&
        !hasSkillInstaller
    ) {
        return { ok: false, message: 'No settings provided.' };
    }

    if (hasContextFolderPath) {
        const contextFolderPath = payload?.contextFolderPath || '';
        const validation = validateContextFolderPath(contextFolderPath);

        if (!validation.ok) {
            console.warn('Context folder validation failed', {
                contextFolderPath,
                message: validation.message,
            });
            return { ok: false, message: validation.message };
        }

        settingsPayload.contextFolderPath = validation.path;
    }

    if (hasLlmProviderApiKey) {
        settingsPayload.llmProviderApiKey = typeof payload.llmProviderApiKey === 'string'
            ? payload.llmProviderApiKey
            : '';
    }

    if (hasLlmProviderName) {
        settingsPayload.llmProviderName = typeof payload.llmProviderName === 'string'
            ? payload.llmProviderName
            : '';
    }

    if (hasStillsMarkdownExtractorType) {
        const raw = typeof payload.stillsMarkdownExtractorType === 'string' ? payload.stillsMarkdownExtractorType : '';
        const normalized = raw.trim().toLowerCase();
        settingsPayload.stillsMarkdownExtractorType = normalized === 'apple_vision_ocr' ? 'apple_vision_ocr' : 'llm';
    }

    if (hasRecordingHotkey) {
        settingsPayload.recordingHotkey = typeof payload.recordingHotkey === 'string'
            ? payload.recordingHotkey
            : DEFAULT_RECORDING_HOTKEY;
    }

    if (hasAlwaysRecordWhenActive) {
        const nextValue = payload.alwaysRecordWhenActive === true;
        settingsPayload.alwaysRecordWhenActive = nextValue;
    }

    if (hasSkillInstaller) {
        const raw = payload?.skillInstaller;
        const harness = typeof raw?.harness === 'string' ? raw.harness.trim().toLowerCase() : '';
        if (!harness) {
            return { ok: false, message: 'Harness is required.' };
        }
        if (harness !== 'claude' && harness !== 'codex' && harness !== 'cursor') {
            return { ok: false, message: 'Invalid harness.' };
        }

        // Canonical install path is derived from the harness.
        settingsPayload.skillInstaller = {
            harness,
            installPath: resolveHarnessSkillPath(harness),
        };
    }

    try {
        saveSettings(settingsPayload);
        console.log('Settings saved');
        if (onSettingsSaved) {
            try {
                onSettingsSaved(loadSettings());
            } catch (error) {
                console.error('Failed to notify settings update', error);
            }
        }
        return { ok: true, hotkeysChanged: hasRecordingHotkey };
    } catch (error) {
        console.error('Failed to save settings', error);
        return { ok: false, message: 'Failed to save settings.' };
    }
}

async function handlePickContextFolder(event) {
    if (process.env.JIMINY_E2E === '1' && process.env.JIMINY_E2E_CONTEXT_PATH) {
        const testPath = process.env.JIMINY_E2E_CONTEXT_PATH;
        const validation = validateContextFolderPath(testPath);
        if (!validation.ok) {
            console.warn('E2E mode: invalid context folder path', {
                path: testPath,
                message: validation.message,
            });
            return { canceled: true, error: validation.message };
        }

        console.log('E2E mode: returning context folder path', { path: validation.path });
        return { canceled: false, path: validation.path };
    }

    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const openDialogOptions = {
        title: 'Select Context Folder',
        properties: ['openDirectory'],
    };

    console.log('Opening context folder picker');
    if (parentWindow) {
        parentWindow.show();
        parentWindow.focus();
    }
    app.focus({ steal: true });

    let result;
    try {
        result = parentWindow
            ? await dialog.showOpenDialog(parentWindow, openDialogOptions)
            : await dialog.showOpenDialog(openDialogOptions);
    } catch (error) {
        console.error('Failed to open context folder picker', error);
        return { canceled: true, error: 'Failed to open folder picker.' };
    }

    if (result.canceled || result.filePaths.length === 0) {
        console.log('Context folder picker canceled');
        return { canceled: true };
    }

    console.log('Context folder selected', { path: result.filePaths[0] });
    return { canceled: false, path: result.filePaths[0] };
}

function handleCheckScreenRecordingPermission() {
    const permissionStatus = getScreenRecordingPermissionStatus();
    const granted = permissionStatus === 'granted';
    console.log('Screen Recording permission checked', { permissionStatus, granted });
    return {
        ok: true,
        permissionStatus,
        granted
    };
}

async function handleOpenScreenRecordingSettings() {
    const result = await openScreenRecordingSettings();
    if (result.ok) {
        console.log('Opened Screen Recording settings');
    } else {
        console.warn('Failed to open Screen Recording settings', { message: result.message || 'unknown-error' });
    }
    return result;
}

module.exports = {
    registerSettingsHandlers,
};
