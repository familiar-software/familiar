const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { loadSettings, resolveSettingsPath, saveSettings, validateContextFolderPath } = require('../settings');
const { DEFAULT_CAPTURE_HOTKEY, DEFAULT_CLIPBOARD_HOTKEY, DEFAULT_RECORDING_HOTKEY } = require('../hotkeys');
const { getScreenRecordingPermissionStatus } = require('../screen-recording/permissions');

let onSettingsSaved = null;

/**
 * Registers IPC handlers for settings operations.
 */
function registerSettingsHandlers(options = {}) {
    onSettingsSaved = typeof options.onSettingsSaved === 'function' ? options.onSettingsSaved : null;
    ipcMain.handle('settings:get', handleGetSettings);
    ipcMain.handle('settings:save', handleSaveSettings);
    ipcMain.handle('settings:pickContextFolder', handlePickContextFolder);
    ipcMain.handle('settings:pickExclusion', handlePickExclusion);
    console.log('Settings IPC handlers registered');
}

function handleGetSettings() {
    try {
        const settingsPath = resolveSettingsPath();
        const isFirstRun = !fs.existsSync(settingsPath);
        const settings = loadSettings();
        const contextFolderPath = settings.contextFolderPath || '';
        const llmProviderName = settings?.llm_provider?.provider || '';
        const llmProviderApiKey = settings?.llm_provider?.api_key || '';
        const exclusions = Array.isArray(settings.exclusions) ? settings.exclusions : [];
        const captureHotkey = typeof settings.captureHotkey === 'string' ? settings.captureHotkey : DEFAULT_CAPTURE_HOTKEY;
        const clipboardHotkey = typeof settings.clipboardHotkey === 'string' ? settings.clipboardHotkey : DEFAULT_CLIPBOARD_HOTKEY;
        const recordingHotkey = typeof settings.recordingHotkey === 'string' ? settings.recordingHotkey : DEFAULT_RECORDING_HOTKEY;
        const alwaysRecordWhenActive = settings.alwaysRecordWhenActive === true;
        const screenRecordingPermissionStatus = getScreenRecordingPermissionStatus();
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
            exclusions,
            captureHotkey,
            clipboardHotkey,
            recordingHotkey,
            alwaysRecordWhenActive,
            screenRecordingPermissionStatus,
            isFirstRun
        };
    } catch (error) {
        console.error('Failed to load settings', error);
        return {
            contextFolderPath: '',
            validationMessage: 'Failed to load settings.',
            llmProviderName: '',
            llmProviderApiKey: '',
            exclusions: [],
            captureHotkey: DEFAULT_CAPTURE_HOTKEY,
            clipboardHotkey: DEFAULT_CLIPBOARD_HOTKEY,
            recordingHotkey: DEFAULT_RECORDING_HOTKEY,
            alwaysRecordWhenActive: false,
            screenRecordingPermissionStatus: getScreenRecordingPermissionStatus(),
            isFirstRun: false
        };
    }
}

function handleSaveSettings(_event, payload) {
    const hasContextFolderPath = Object.prototype.hasOwnProperty.call(payload || {}, 'contextFolderPath');
    const hasLlmProviderApiKey = Object.prototype.hasOwnProperty.call(payload || {}, 'llmProviderApiKey');
    const hasLlmProviderName = Object.prototype.hasOwnProperty.call(payload || {}, 'llmProviderName');
    const hasExclusions = Object.prototype.hasOwnProperty.call(payload || {}, 'exclusions');
    const hasCaptureHotkey = Object.prototype.hasOwnProperty.call(payload || {}, 'captureHotkey');
    const hasClipboardHotkey = Object.prototype.hasOwnProperty.call(payload || {}, 'clipboardHotkey');
    const hasAlwaysRecordWhenActive = Object.prototype.hasOwnProperty.call(payload || {}, 'alwaysRecordWhenActive');
    const hasRecordingHotkey = Object.prototype.hasOwnProperty.call(payload || {}, 'recordingHotkey');
    const settingsPayload = {};

    if (
        !hasContextFolderPath &&
        !hasLlmProviderApiKey &&
        !hasLlmProviderName &&
        !hasExclusions &&
        !hasCaptureHotkey &&
        !hasClipboardHotkey &&
        !hasAlwaysRecordWhenActive &&
        !hasRecordingHotkey
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

    if (hasExclusions) {
        settingsPayload.exclusions = Array.isArray(payload.exclusions) ? payload.exclusions : [];
    }

    if (hasCaptureHotkey) {
        settingsPayload.captureHotkey = typeof payload.captureHotkey === 'string'
            ? payload.captureHotkey
            : DEFAULT_CAPTURE_HOTKEY;
    }

    if (hasClipboardHotkey) {
        settingsPayload.clipboardHotkey = typeof payload.clipboardHotkey === 'string'
            ? payload.clipboardHotkey
            : DEFAULT_CLIPBOARD_HOTKEY;
    }

    if (hasRecordingHotkey) {
        settingsPayload.recordingHotkey = typeof payload.recordingHotkey === 'string'
            ? payload.recordingHotkey
            : DEFAULT_RECORDING_HOTKEY;
    }

    if (hasAlwaysRecordWhenActive) {
        const nextValue = payload.alwaysRecordWhenActive === true;
        if (nextValue) {
            const permissionStatus = getScreenRecordingPermissionStatus();
            if (permissionStatus !== 'granted') {
                return {
                    ok: false,
                    message: 'Screen Recording permission required. Open System Settings → Privacy & Security → Screen Recording.',
                    permissionStatus
                };
            }
        }
        settingsPayload.alwaysRecordWhenActive = nextValue;
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
        return { ok: true, hotkeysChanged: hasCaptureHotkey || hasClipboardHotkey || hasRecordingHotkey };
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

async function handlePickExclusion(event, contextFolderPath) {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const defaultPath = contextFolderPath || undefined;

    const openDialogOptions = {
        title: 'Select File or Folder to Exclude',
        defaultPath,
        properties: ['openFile', 'openDirectory'],
    };

    console.log('Opening exclusion picker', { defaultPath });
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
        console.error('Failed to open exclusion picker', error);
        return { canceled: true, error: 'Failed to open picker.' };
    }

    if (result.canceled || result.filePaths.length === 0) {
        console.log('Exclusion picker canceled');
        return { canceled: true };
    }

    const selectedPath = result.filePaths[0];

    if (contextFolderPath) {
        const resolvedContext = path.resolve(contextFolderPath);
        const resolvedSelected = path.resolve(selectedPath);
        if (!resolvedSelected.startsWith(resolvedContext + path.sep) && resolvedSelected !== resolvedContext) {
            console.warn('Selected exclusion is outside context folder', { selectedPath, contextFolderPath });
            return { canceled: true, error: 'Selected path must be inside the context folder.' };
        }

        const relativePath = path.relative(resolvedContext, resolvedSelected);
        console.log('Exclusion selected', { absolutePath: selectedPath, relativePath });
        return { canceled: false, path: relativePath };
    }

    console.log('Exclusion selected (no context folder)', { path: selectedPath });
    return { canceled: false, path: selectedPath };
}

module.exports = {
    registerSettingsHandlers,
};
