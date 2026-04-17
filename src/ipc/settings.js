const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadSettings,
  saveSettings,
  validateContextFolderPath,
  validateWritableDirectoryPath,
  resolveDefaultContextFolderPath
} = require('../settings');
const {
  getScreenRecordingPermissionStatus,
  openScreenRecordingSettings
} = require('../screen-capture/permissions');
const { createRecorder } = require('../screen-stills/recorder');
const { resolveAutoCleanupRetentionDays } = require('../storage/auto-cleanup-retention');
const {
  normalizeCapturePrivacySettings
} = require('../screen-stills/capture-privacy');
const { listInstalledApps, getInstalledAppIconDataUrl } = require('../apps/installed-apps');
const { getStorageDir } = require('../const');

let onSettingsSaved = null;
let onMoveContextFolder = null;
const installedAppIconCache = new Map();
const PROBE_RECORDER_WINDOW_NAME = 'familiar-permission-probe-';
const PERMISSION_PROBE_TIMEOUT_MS = 12_000;
let permissionProbeRecorder = null;

const readPermissionProbeRecorder = () => {
  if (!permissionProbeRecorder) {
    permissionProbeRecorder = createRecorder({ logger: console });
  }
  return permissionProbeRecorder;
};

const toPermissionProbeResult = (permissionStatus, message = null) => ({
  permissionStatus,
  granted: permissionStatus === 'granted',
  ok: permissionStatus === 'granted',
  message
});

async function runPermissionProbe() {
  const permissionStatus = getScreenRecordingPermissionStatus();
  if (permissionStatus === 'unavailable') {
    return {
      ok: false,
      permissionStatus,
      granted: false,
      message: 'Screen Recording permissions are not applicable on this platform.'
    };
  }

  const probeFolder = fs.mkdtempSync(path.join(os.tmpdir(), PROBE_RECORDER_WINDOW_NAME));
  const recorder = readPermissionProbeRecorder();

  let started = false;
  try {
    const startedResult = await recorder.start({
      contextFolderPath: probeFolder,
      skipPermissionCheck: true
    });
    if (!startedResult || startedResult.ok === false) {
      const status = getScreenRecordingPermissionStatus();
      return {
        ...toPermissionProbeResult(status, startedResult?.message || 'Dummy recording did not start.'),
        ok: false
      };
    }
    started = true;
    await recorder.stop({ reason: 'permission-check' });
    started = false;
    return {
      ...toPermissionProbeResult('granted'),
      ok: true
    };
  } catch (error) {
    const status = getScreenRecordingPermissionStatus();
    return {
      ...toPermissionProbeResult(status, error?.message || 'Dummy recording failed.'),
      ok: status === 'granted'
    };
  } finally {
    if (started) {
      let cleanupTimer = null;
      try {
        await Promise.race([
          recorder.stop({ reason: 'permission-check-cleanup' }),
          new Promise((_, reject) => {
            cleanupTimer = setTimeout(() => reject(new Error('Dummy recording stop timeout.')), PERMISSION_PROBE_TIMEOUT_MS);
          })
        ]);
      } catch (error) {
        console.error('Failed to stop permission probe recorder', { message: error?.message || String(error) });
      } finally {
        if (cleanupTimer) {
          clearTimeout(cleanupTimer);
        }
      }
    }
    try {
      fs.rmSync(probeFolder, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean permission probe folder', { message: error?.message || String(error) });
    }
  }
}

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
    onMoveContextFolder = typeof options.onMoveContextFolder === 'function' ? options.onMoveContextFolder : null;
    ipcMain.handle('settings:get', handleGetSettings);
    ipcMain.handle('settings:save', handleSaveSettings);
    ipcMain.handle('settings:pickContextFolder', handlePickContextFolder);
    ipcMain.handle('settings:pickDirectory', handlePickDirectory);
    ipcMain.handle('settings:moveContextFolder', handleMoveContextFolder);
    ipcMain.handle('settings:listInstalledApps', handleListInstalledApps);
    ipcMain.handle('settings:getInstalledAppIcon', handleGetInstalledAppIcon);
    ipcMain.handle('settings:checkScreenRecordingPermission', handleCheckScreenRecordingPermission);
    ipcMain.handle('settings:requestScreenRecordingPermission', handleRequestScreenRecordingPermission);
    ipcMain.handle('settings:openScreenRecordingSettings', handleOpenScreenRecordingSettings);
    ipcMain.handle('settings:openStorageInFinder', handleOpenStorageInFinder);
    ipcMain.handle('settings:applyDefaultContextFolder', handleApplyDefaultContextFolder);
    console.log('Settings IPC handlers registered');
}

function handleGetSettings() {
    const appVersion = readAppVersion();
    try {
        const settings = loadSettings();
        const contextFolderPath = settings.contextFolderPath || '';
        const alwaysRecordWhenActive = settings.alwaysRecordWhenActive === true;
        const storageAutoCleanupRetentionDays = resolveAutoCleanupRetentionDays(
            settings.storageAutoCleanupRetentionDays
        );
        const wizardCompleted = settings.wizardCompleted === true;
        const capturePrivacy = normalizeCapturePrivacySettings(settings?.capturePrivacy);
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
            alwaysRecordWhenActive,
            storageAutoCleanupRetentionDays,
            wizardCompleted,
            capturePrivacy,
            appVersion,
            homedir: os.homedir()
        };
    } catch (error) {
        console.error('Failed to load settings', error);
        return {
            contextFolderPath: '',
            validationMessage: 'Failed to load settings.',
            alwaysRecordWhenActive: false,
            storageAutoCleanupRetentionDays: resolveAutoCleanupRetentionDays(undefined),
            wizardCompleted: false,
            capturePrivacy: normalizeCapturePrivacySettings(),
            appVersion
        };
    }
}

function handleSaveSettings(_event, payload) {
    const hasContextFolderPath = Object.prototype.hasOwnProperty.call(payload || {}, 'contextFolderPath');
    const hasAlwaysRecordWhenActive = Object.prototype.hasOwnProperty.call(payload || {}, 'alwaysRecordWhenActive');
    const hasStorageAutoCleanupRetentionDays = Object.prototype.hasOwnProperty.call(payload || {}, 'storageAutoCleanupRetentionDays');
    const hasWizardCompleted = Object.prototype.hasOwnProperty.call(payload || {}, 'wizardCompleted');
    const hasCapturePrivacy = Object.prototype.hasOwnProperty.call(payload || {}, 'capturePrivacy');
    const settingsPayload = {};

    if (
        !hasContextFolderPath &&
        !hasAlwaysRecordWhenActive &&
        !hasStorageAutoCleanupRetentionDays &&
        !hasWizardCompleted &&
        !hasCapturePrivacy
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

    if (hasAlwaysRecordWhenActive) {
        const nextValue = payload.alwaysRecordWhenActive === true;
        settingsPayload.alwaysRecordWhenActive = nextValue;
    }

    if (hasStorageAutoCleanupRetentionDays) {
        settingsPayload.storageAutoCleanupRetentionDays = resolveAutoCleanupRetentionDays(
            payload.storageAutoCleanupRetentionDays
        );
    }

    if (hasWizardCompleted) {
        settingsPayload.wizardCompleted = payload.wizardCompleted === true;
    }

    if (hasCapturePrivacy) {
        settingsPayload.capturePrivacy = normalizeCapturePrivacySettings(payload?.capturePrivacy);
    }

    try {
        const saveResult = saveSettings(settingsPayload);
        if (saveResult) {
            console.log('Settings saved');
            if (onSettingsSaved) {
                try {
                    onSettingsSaved(loadSettings());
                } catch (error) {
                    console.error('Failed to notify settings update', error);
                }
            }
        }
        return {
            ok: true
        };
    } catch (error) {
        console.error('Failed to save settings', error);
        return { ok: false, message: 'Failed to save settings.' };
    }
}

async function handleListInstalledApps() {
    try {
        return {
            ok: true,
            apps: await listInstalledApps({ logger: console })
        };
    } catch (error) {
        console.error('Failed to list installed apps', error);
        return {
            ok: false,
            message: error?.message || 'Failed to list installed apps.',
            apps: []
        };
    }
}

async function handleGetInstalledAppIcon(_event, payload) {
    const appPath = typeof payload?.appPath === 'string' ? payload.appPath.trim() : '';
    const iconPath = typeof payload?.iconPath === 'string' ? payload.iconPath.trim() : '';
    const cacheKey = `${appPath}::${iconPath}`;
    if (!appPath) {
        return {
            ok: true,
            iconDataUrl: null
        };
    }

    if (installedAppIconCache.has(cacheKey)) {
        return {
            ok: true,
            iconDataUrl: installedAppIconCache.get(cacheKey)
        };
    }

    try {
        const iconDataUrl = await getInstalledAppIconDataUrl({
            appPath,
            iconPath,
            getFileIcon: (targetPath, options) => app.getFileIcon(targetPath, options),
            logger: console
        });
        installedAppIconCache.set(cacheKey, iconDataUrl);
        return {
            ok: true,
            iconDataUrl
        };
    } catch (error) {
        console.error('Failed to get installed app icon', {
            appPath,
            message: error?.message || String(error)
        });
        return {
            ok: false,
            message: error?.message || 'Failed to load installed app icon.',
            iconDataUrl: null
        };
    }
}

async function pickDirectory(event, {
    title,
    e2ePathEnvVar,
    e2eInvalidLogLabel,
    e2eSelectedLogLabel,
    openLogLabel,
    cancelLogLabel,
    selectedLogLabel
} = {}) {
    if (process.env.FAMILIAR_E2E === '1' && e2ePathEnvVar) {
        const testPath = process.env[e2ePathEnvVar];
        const validation = validateWritableDirectoryPath(testPath);
        if (!validation.ok) {
            console.warn(e2eInvalidLogLabel || 'E2E mode: invalid directory path', {
                path: testPath,
                message: validation.message,
            });
            return { canceled: true, error: validation.message };
        }

        console.log(e2eSelectedLogLabel || 'E2E mode: returning directory path', { path: validation.path });
        return { canceled: false, path: validation.path };
    }

    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const openDialogOptions = {
        title: typeof title === 'string' && title.trim().length > 0 ? title : 'Select Folder',
        properties: ['openDirectory'],
    };

    console.log(openLogLabel || 'Opening folder picker');
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
        console.log(cancelLogLabel || 'Folder picker canceled');
        return { canceled: true };
    }

    console.log(selectedLogLabel || 'Folder selected', { path: result.filePaths[0] });
    return { canceled: false, path: result.filePaths[0] };
}

async function handlePickContextFolder(event) {
    return pickDirectory(event, {
        title: 'Select Context Folder',
        e2ePathEnvVar: 'FAMILIAR_E2E_CONTEXT_PATH',
        e2eInvalidLogLabel: 'E2E mode: invalid context folder path',
        e2eSelectedLogLabel: 'E2E mode: returning context folder path',
        openLogLabel: 'Opening context folder picker',
        cancelLogLabel: 'Context folder picker canceled',
        selectedLogLabel: 'Context folder selected'
    });
}

async function handlePickDirectory(event) {
    return pickDirectory(event, {
        title: 'Select Folder',
        openLogLabel: 'Opening generic folder picker',
        cancelLogLabel: 'Generic folder picker canceled',
        selectedLogLabel: 'Folder selected (generic)'
    });
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

async function handleRequestScreenRecordingPermission() {
    const result = await runPermissionProbe();
    if (result?.ok === true) {
        const permissionStatus = result.permissionStatus;
        const granted = result.granted === true;
        console.log('Screen Recording permission requested', { permissionStatus, granted });
    } else {
        console.warn('Failed to request Screen Recording permissions', {
            message: result?.message || 'unknown-error',
            permissionStatus: result?.permissionStatus
        });
    }
    return result;
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

// Open the storage dir (<contextFolderPath>/familiar) in Finder so the
// user can see exactly where Familiar writes screenshots and markdown.
// Creates the dir on demand — by the time we reach this handler from
// the onboarding wizard, contextFolderPath is set, but the storage
// subdir may not yet exist on disk.
async function handleOpenStorageInFinder() {
    try {
        const settings = loadSettings();
        const contextFolderPath = typeof settings?.contextFolderPath === 'string' ? settings.contextFolderPath : '';
        if (!contextFolderPath) {
            return { ok: false, message: 'Context folder is not set yet.' };
        }
        const storageDir = getStorageDir(contextFolderPath);
        if (!storageDir) {
            return { ok: false, message: 'Could not resolve storage directory.' };
        }
        try {
            fs.mkdirSync(storageDir, { recursive: true });
        } catch (error) {
            console.warn('Failed to create storage dir before opening in Finder', { storageDir, message: error?.message });
            return { ok: false, message: error?.message || 'Failed to create storage directory.' };
        }
        const errorMessage = await shell.openPath(storageDir);
        if (errorMessage) {
            console.warn('shell.openPath returned an error', { storageDir, errorMessage });
            return { ok: false, message: errorMessage };
        }
        console.log('Opened storage dir in Finder', { storageDir });
        return { ok: true, storageDir };
    } catch (error) {
        console.error('Failed to open storage dir in Finder', error);
        return { ok: false, message: error?.message || 'Failed to open storage directory.' };
    }
}

// Idempotent: if contextFolderPath is already set we leave it alone.
// Otherwise sets it to $HOME (sibling of ~/.familiar/) and creates the
// storage subdir on disk so "Show in Finder" can open something.
async function handleApplyDefaultContextFolder() {
    try {
        const settings = loadSettings();
        if (settings?.wizardCompleted === true) {
            return { ok: true, applied: false };
        }
        const existing = typeof settings?.contextFolderPath === 'string' ? settings.contextFolderPath.trim() : '';
        if (existing) {
            return { ok: true, contextFolderPath: existing, applied: false };
        }
        const defaultPath = resolveDefaultContextFolderPath();
        const validation = validateContextFolderPath(defaultPath);
        if (!validation.ok) {
            console.warn('Default context folder path is not writable', { defaultPath, message: validation.message });
            return { ok: false, message: validation.message };
        }
        try {
            saveSettings({ contextFolderPath: defaultPath });
        } catch (error) {
            console.error('Failed to save default context folder', error);
            return { ok: false, message: error?.message || 'Failed to save default context folder.' };
        }
        try {
            fs.mkdirSync(getStorageDir(defaultPath), { recursive: true });
        } catch (error) {
            console.warn('Failed to create default storage dir', { storageDir: getStorageDir(defaultPath), message: error?.message });
        }
        if (typeof onSettingsSaved === 'function') {
            try {
                onSettingsSaved(loadSettings());
            } catch (error) {
                console.warn('onSettingsSaved threw after applying default context folder', error);
            }
        }
        console.log('Applied default context folder', { contextFolderPath: defaultPath });
        return { ok: true, contextFolderPath: defaultPath, applied: true };
    } catch (error) {
        console.error('Failed to apply default context folder', error);
        return { ok: false, message: error?.message || 'Failed to apply default context folder.' };
    }
}

async function handleMoveContextFolder(_event, payload) {
    if (!onMoveContextFolder) {
        return { ok: false, message: 'Context folder move unavailable. Restart the app.' };
    }

    try {
        return await onMoveContextFolder(payload);
    } catch (error) {
        console.error('Failed to move context folder', error);
        return { ok: false, message: error?.message || 'Failed to move context folder.' };
    }
}

module.exports = {
    registerSettingsHandlers,
};
