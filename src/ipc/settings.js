const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadSettings,
  saveSettings,
  validateContextFolderPath,
  validateWritableDirectoryPath
} = require('../settings');
const { normalizeStringArray } = require('../utils/list');
const {
  getScreenRecordingPermissionStatus,
  openScreenRecordingSettings
} = require('../screen-capture/permissions');
const { resolveHarnessSkillPath } = require('../skills/installer');
const { createRecorder } = require('../screen-stills/recorder');
const { resolveAutoCleanupRetentionDays } = require('../storage/auto-cleanup-retention');
const {
  normalizeCapturePrivacySettings
} = require('../screen-stills/capture-privacy');
const { listInstalledApps, getInstalledAppIconDataUrl } = require('../apps/installed-apps');

let onSettingsSaved = null;
let onMoveContextFolder = null;
const installedAppIconCache = new Map();
const PROBE_RECORDER_WINDOW_NAME = 'familiar-permission-probe-';
const PERMISSION_PROBE_TIMEOUT_MS = 12_000;
let permissionProbeRecorder = null;

const VALID_SKILL_HARNESSES = new Set(['claude', 'codex', 'cursor', 'antigravity']);

const normalizeSkillInstallerHarnesses = (raw = {}) => {
    const directHarnesses = Array.isArray(raw?.harness) ? raw.harness : [raw?.harness];
    const legacyHarnesses = Array.isArray(raw?.harnesses) ? raw.harnesses : [];
    return normalizeStringArray([...directHarnesses, ...legacyHarnesses], { lowerCase: true })
        .filter((value) => VALID_SKILL_HARNESSES.has(value));
};

const normalizeSkillInstallerPaths = (raw = {}, harnesses = []) => {
    const list = [];
    if (Array.isArray(raw?.installPath)) {
        list.push(...raw.installPath);
    } else if (typeof raw?.installPath === 'string') {
        list.push(raw.installPath);
    }
    const map = raw && typeof raw.installPaths === 'object' ? raw.installPaths : {};
    const normalized = [];
    harnesses.forEach((harness, index) => {
        const direct = typeof list[index] === 'string' ? list[index].trim() : '';
        const mapped = typeof map[harness] === 'string' ? map[harness].trim() : '';
        const value = direct || mapped;
        normalized.push(value);
    });
    return normalized;
};

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
    ipcMain.handle('settings:moveContextFolder', handleMoveContextFolder);
    ipcMain.handle('settings:listInstalledApps', handleListInstalledApps);
    ipcMain.handle('settings:getInstalledAppIcon', handleGetInstalledAppIcon);
    ipcMain.handle('settings:checkScreenRecordingPermission', handleCheckScreenRecordingPermission);
    ipcMain.handle('settings:requestScreenRecordingPermission', handleRequestScreenRecordingPermission);
    ipcMain.handle('settings:openScreenRecordingSettings', handleOpenScreenRecordingSettings);
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
        const skillInstallerHarness = normalizeSkillInstallerHarnesses(settings?.skillInstaller || {});
        const skillInstallerInstallPath = normalizeSkillInstallerPaths(settings?.skillInstaller || {}, skillInstallerHarness);
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
            skillInstaller: {
                harness: skillInstallerHarness,
                installPath: skillInstallerInstallPath,
            },
            capturePrivacy,
            appVersion
        };
    } catch (error) {
        console.error('Failed to load settings', error);
        return {
            contextFolderPath: '',
            validationMessage: 'Failed to load settings.',
            alwaysRecordWhenActive: false,
            storageAutoCleanupRetentionDays: resolveAutoCleanupRetentionDays(undefined),
            wizardCompleted: false,
            skillInstaller: { harness: [], installPath: [] },
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
    const hasSkillInstaller = Object.prototype.hasOwnProperty.call(payload || {}, 'skillInstaller');
    const hasCapturePrivacy = Object.prototype.hasOwnProperty.call(payload || {}, 'capturePrivacy');
    const settingsPayload = {};

    if (
        !hasContextFolderPath &&
        !hasAlwaysRecordWhenActive &&
        !hasStorageAutoCleanupRetentionDays &&
        !hasWizardCompleted &&
        !hasSkillInstaller
        && !hasCapturePrivacy
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

    if (hasSkillInstaller) {
        const raw = payload?.skillInstaller;
        const harnesses = normalizeSkillInstallerHarnesses(raw || {});
        if (harnesses.length === 0) {
            return { ok: false, message: 'At least one harness is required.' };
        }

        // Canonical install paths are derived from selected harnesses.
        settingsPayload.skillInstaller = {
            harness: harnesses,
            installPath: harnesses.map((harness) => resolveHarnessSkillPath(harness)),
        };
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
