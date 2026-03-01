const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadSettings, saveSettings, validateContextFolderPath } = require('../settings');
const { normalizeStringArray } = require('../utils/list');
const {
  getScreenRecordingPermissionStatus,
  openScreenRecordingSettings
} = require('../screen-capture/permissions');
const { resolveHarnessSkillPath } = require('../skills/installer');
const { createRecorder } = require('../screen-stills/recorder');
const { resolveAutoCleanupRetentionDays } = require('../storage/auto-cleanup-retention');

let onSettingsSaved = null;
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
    ipcMain.handle('settings:get', handleGetSettings);
    ipcMain.handle('settings:save', handleSaveSettings);
    ipcMain.handle('settings:pickContextFolder', handlePickContextFolder);
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
        const llmProviderName = settings?.stills_markdown_extractor?.llm_provider?.provider || '';
        const llmProviderApiKey = settings?.stills_markdown_extractor?.llm_provider?.api_key || '';
        const stillsMarkdownExtractorType = (() => {
            const type = settings?.stills_markdown_extractor?.type;
            if (typeof type === 'string' && type.trim()) {
                return type;
            }
            return 'apple_vision_ocr';
        })();
        const alwaysRecordWhenActive = settings.alwaysRecordWhenActive === true;
        const storageAutoCleanupRetentionDays = resolveAutoCleanupRetentionDays(
            settings.storageAutoCleanupRetentionDays
        );
        const wizardCompleted = settings.wizardCompleted === true;
        const skillInstallerHarness = normalizeSkillInstallerHarnesses(settings?.skillInstaller || {});
        const skillInstallerInstallPath = normalizeSkillInstallerPaths(settings?.skillInstaller || {}, skillInstallerHarness);
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
            alwaysRecordWhenActive,
            storageAutoCleanupRetentionDays,
            wizardCompleted,
            skillInstaller: {
                harness: skillInstallerHarness,
                installPath: skillInstallerInstallPath,
            },
            appVersion
        };
    } catch (error) {
        console.error('Failed to load settings', error);
        return {
            contextFolderPath: '',
            validationMessage: 'Failed to load settings.',
            llmProviderName: '',
            llmProviderApiKey: '',
            stillsMarkdownExtractorType: 'apple_vision_ocr',
            alwaysRecordWhenActive: false,
            storageAutoCleanupRetentionDays: resolveAutoCleanupRetentionDays(undefined),
            wizardCompleted: false,
            skillInstaller: { harness: [], installPath: [] },
            appVersion
        };
    }
}

function handleSaveSettings(_event, payload) {
    const hasContextFolderPath = Object.prototype.hasOwnProperty.call(payload || {}, 'contextFolderPath');
    const hasLlmProviderApiKey = Object.prototype.hasOwnProperty.call(payload || {}, 'llmProviderApiKey');
    const hasLlmProviderName = Object.prototype.hasOwnProperty.call(payload || {}, 'llmProviderName');
    const hasStillsMarkdownExtractorType = Object.prototype.hasOwnProperty.call(payload || {}, 'stillsMarkdownExtractorType');
    const hasAlwaysRecordWhenActive = Object.prototype.hasOwnProperty.call(payload || {}, 'alwaysRecordWhenActive');
    const hasStorageAutoCleanupRetentionDays = Object.prototype.hasOwnProperty.call(payload || {}, 'storageAutoCleanupRetentionDays');
    const hasWizardCompleted = Object.prototype.hasOwnProperty.call(payload || {}, 'wizardCompleted');
    const hasSkillInstaller = Object.prototype.hasOwnProperty.call(payload || {}, 'skillInstaller');
    const settingsPayload = {};

    if (
        !hasContextFolderPath &&
        !hasLlmProviderApiKey &&
        !hasLlmProviderName &&
        !hasStillsMarkdownExtractorType &&
        !hasAlwaysRecordWhenActive &&
        !hasStorageAutoCleanupRetentionDays &&
        !hasWizardCompleted &&
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
        return { ok: true };
    } catch (error) {
        console.error('Failed to save settings', error);
        return { ok: false, message: 'Failed to save settings.' };
    }
}

async function handlePickContextFolder(event) {
    if (process.env.FAMILIAR_E2E === '1' && process.env.FAMILIAR_E2E_CONTEXT_PATH) {
        const testPath = process.env.FAMILIAR_E2E_CONTEXT_PATH;
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

module.exports = {
    registerSettingsHandlers,
};
