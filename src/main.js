const { app, BrowserWindow, Tray, dialog, nativeImage, ipcMain } = require('electron');
const path = require('node:path');

const { registerIpcHandlers } = require('./ipc');
const {
    registerRecordingHotkey,
    unregisterGlobalHotkeys,
    DEFAULT_RECORDING_HOTKEY,
} = require('./hotkeys');
const { showWindow } = require('./utils/window');
const { ensureHomebrewPath } = require('./utils/path');
const { loadSettings } = require('./settings');
const { initLogging } = require('./logger');
const { showToast } = require('./toast');
const {
    resolveHotkeyAccelerators,
    createTrayMenuController,
} = require('./tray/refresh');
const { initializeAutoUpdater, installDownloadedUpdate, scheduleDailyUpdateCheck } = require('./updates');
const { createScreenStillsController } = require('./screen-stills');
const { createPresenceMonitor } = require('./screen-capture/presence');

const trayIconPath = path.join(__dirname, 'icon.png');

let tray = null;
let trayHandlers = null;
let trayMenuController = null;
let settingsWindow = null;
let isQuitting = false;
let screenStillsController = null;
let presenceMonitor = null;
let recordingShutdownInProgress = false;

const isE2E = process.env.JIMINY_E2E === '1';
const isCI = process.env.CI === 'true' || process.env.CI === '1';
const pauseDurationOverrideMs = (() => {
    const parsePauseOverride = (value) => {
        if (typeof value !== 'string' || value.trim() === '') {
            return null;
        }
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return null;
        }
        return Math.floor(parsed);
    };
    return parsePauseOverride(process.env.JIMINY_E2E_PAUSE_MS)
      ?? parsePauseOverride(process.env.JIMINY_RECORDING_PAUSE_MS);
})();

initLogging();
ensureHomebrewPath({ logger: console });

const updateScreenCaptureFromSettings = () => {
    if (!screenStillsController) {
        return;
    }
    const settings = loadSettings();
    const payload = {
        enabled: settings.alwaysRecordWhenActive === true,
        contextFolderPath: typeof settings.contextFolderPath === 'string' ? settings.contextFolderPath : ''
    };
    if (screenStillsController) {
        screenStillsController.updateSettings(payload);
    }
};

const attemptScreenCaptureShutdown = (reason) => {
    if (!screenStillsController) {
        return;
    }
    screenStillsController.shutdown(reason)
        .catch((error) => {
            console.error('Failed to stop screen capture', error);
        });
};

const handleStillsError = ({ message, willRetry, retryDelayMs, attempt } = {}) => {
    if (!message) {
        return;
    }

    // If the controller is automatically retrying, only toast once to avoid spam.
    if (willRetry === true && Number.isFinite(attempt) && attempt > 1) {
        console.warn('Recording issue (retrying)', { message, retryDelayMs, attempt });
        return;
    }

    console.warn('Recording issue', { message });
    showToast({
        title: 'Recording issue',
        body: willRetry === true && Number.isFinite(retryDelayMs)
            ? `${message}\nRetrying in ${Math.round(retryDelayMs / 1000)}s...`
            : message,
        type: 'warning',
        size: 'large'
    });
};

const startScreenStills = async () => {
    if (!screenStillsController) {
        return { ok: true, skipped: true };
    }
    try {
        const result = await screenStillsController.manualStart();
        if (result && result.ok === false) {
            handleStillsError({ message: result.message || 'Failed to start recording.' });
        }
        return result;
    } catch (error) {
        console.error('Failed to start recording', error);
        handleStillsError({ message: 'Failed to start recording.' });
        return { ok: false, message: 'Failed to start recording.' };
    }
};

const pauseScreenStills = async () => {
    if (!screenStillsController) {
        return { ok: true, skipped: true };
    }
    try {
        const result = await screenStillsController.manualPause();
        if (result && result.ok === false) {
            handleStillsError({ message: result.message || 'Failed to pause recording.' });
        }
        return result;
    } catch (error) {
        console.error('Failed to pause recording', error);
        handleStillsError({ message: 'Failed to pause recording.' });
        return { ok: false, message: 'Failed to pause recording.' };
    }
};

const handleCaptureHotkey = async () => {
    if (!screenStillsController) {
        console.warn('Capture hotkey ignored: controller unavailable');
        return { ok: false, message: 'Capture controller unavailable.' };
    }
    const state = screenStillsController.getState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    const isPaused = state.manualPaused === true;

    if (isPaused) {
        return startScreenStills();
    }

    if (isRecording) {
        return pauseScreenStills();
    }

    return startScreenStills();
};

if (process.platform === 'linux' && (isE2E || isCI)) {
    console.log('Applying Linux CI/E2E Electron flags');
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-dev-shm-usage');
}

function createSettingsWindow() {
    const window = new BrowserWindow({
        // Keep the content area width stable while matching the sidebar width from the new design.
        width: 674,
        height: 528,
        resizable: false,
        fullscreenable: false,
        minimizable: false,
        show: false,
        title: 'Jiminy Settings',
        webPreferences: {
            preload: path.join(__dirname, 'dashboard', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    window.loadFile(path.join(__dirname, 'dashboard', 'index.html'));

    window.on('close', (event) => {
        if (!isQuitting && !app.isQuittingForUpdate) {
            event.preventDefault();
            window.hide();
            console.log('Settings window hidden');
        }
    });

    window.on('closed', () => {
        settingsWindow = null;
    });

    console.log('Settings window created');
    return window;
}

function showSettingsWindow(options = {}) {
    if (!settingsWindow) {
        settingsWindow = createSettingsWindow();
    }

    const result = showWindow(settingsWindow, options);
    const reason = options.reason || result.reason;
    if (result.shown) {
        console.log('Settings window shown', { focus: result.focused, reason });
    } else {
        console.log('Settings window display skipped', { reason });
    }
}

function showAboutDialog() {
    let version = 'unknown';
    try {
        version = app.getVersion();
    } catch (error) {
        console.error('Failed to read app version for About dialog', error);
    }

    let aboutIcon = null;
    try {
        const loadedIcon = nativeImage.createFromPath(trayIconPath);
        if (loadedIcon && !loadedIcon.isEmpty()) {
            aboutIcon = loadedIcon;
        } else {
            console.warn(`About dialog icon failed to load from ${trayIconPath}`);
        }
    } catch (error) {
        console.error('Failed to load About dialog icon', error);
    }

    dialog.showMessageBox({
        type: 'info',
        title: 'About Jiminy',
        message: 'Jiminy',
        detail: `Menu bar app (macOS).\nSaves recordings to your Context Folder.\nVersion ${version}`,
        icon: aboutIcon || undefined,
        buttons: ['OK'],
    });
}

function restartApp() {
    console.log('Restarting app');
    if (installDownloadedUpdate({ reason: 'tray-restart' })) {
        return;
    }
    app.relaunch();
    app.quit();
}

function quitApp() {
    console.log('Quitting app');
    app.quit();
}

function registerHotkeysFromSettings() {
    const settings = loadSettings();
    const { recordingAccelerator } = resolveHotkeyAccelerators(settings, {
        DEFAULT_RECORDING_HOTKEY,
    });

    unregisterGlobalHotkeys();

    const recordingResult = registerRecordingHotkey({
        onRecording: () => {
            void handleCaptureHotkey();
        },
        accelerator: recordingAccelerator,
    });
    if (!recordingResult.ok) {
        console.warn('Recording hotkey inactive', {
            reason: recordingResult.reason,
            accelerator: recordingResult.accelerator,
        });
        showToast({
            title: 'Recording hotkey inactive',
            body: 'The recording shortcut could not be registered. Open Settings to update it.',
            type: 'warning',
            size: 'large'
        });
    }

    return {
        recordingResult,
        recordingAccelerator
    };
}

function createTray() {
    const trayIconBase = nativeImage.createFromPath(trayIconPath);
    if (trayIconBase.isEmpty()) {
        console.error(`Tray icon failed to load from ${trayIconPath}`);
    }

    const trayIcon = trayIconBase.resize({ width: 16, height: 16 });

    tray = new Tray(trayIcon);
    tray.setToolTip('Jiminy');

    trayHandlers = {
        onRecordingPause: () => {
            void handleCaptureHotkey();
        },
        onOpenSettings: showSettingsWindow,
        onAbout: showAboutDialog,
        onRestart: restartApp,
        onQuit: quitApp,
    };

    trayMenuController = createTrayMenuController({
        tray,
        trayHandlers,
        DEFAULT_RECORDING_HOTKEY,
        getRecordingState: () => screenStillsController?.getState?.(),
    });

    trayMenuController.refreshTrayMenuFromSettings();
    trayMenuController.registerTrayRefreshHandlers();

    console.log('Tray created');
}

// Register all IPC handlers
registerIpcHandlers({ onSettingsSaved: updateScreenCaptureFromSettings });

// IPC handler for hotkey re-registration
    ipcMain.handle('hotkeys:reregister', () => {
        console.log('Re-registering hotkeys from settings');
        const result = registerHotkeysFromSettings();
        if (trayMenuController) {
            trayMenuController.updateTrayMenu({
                recordingAccelerator: result.recordingAccelerator,
            });
        } else {
            console.warn('Tray menu update skipped: controller not ready');
        }
    return {
        ok: result.recordingResult.ok,
        recordingHotkey: result.recordingResult,
    };
});

// IPC handler to temporarily suspend hotkeys (for recording new ones)
ipcMain.handle('hotkeys:suspend', () => {
    console.log('Suspending global hotkeys for recording');
    unregisterGlobalHotkeys();
    return { ok: true };
});

// IPC handler to resume hotkeys after recording
ipcMain.handle('hotkeys:resume', () => {
    console.log('Resuming global hotkeys after recording');
    const result = registerHotkeysFromSettings();
    if (trayMenuController) {
        trayMenuController.updateTrayMenu({
            recordingAccelerator: result.recordingAccelerator,
        });
    } else {
        console.warn('Tray menu update skipped: controller not ready');
    }
    return {
        ok: result.recordingResult.ok,
        recordingHotkey: result.recordingResult,
    };
});

ipcMain.handle('screenStills:getStatus', () => {
    if (!screenStillsController) {
        return { ok: false, state: 'disabled', isRecording: false };
    }
    const state = screenStillsController.getState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    return { ok: true, state: state.state, isRecording, manualPaused: state.manualPaused };
});

ipcMain.handle('screenStills:start', async () => {
    const result = await startScreenStills();
    const state = screenStillsController?.getState?.() || { state: 'disabled', manualPaused: false };
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    return { ...result, state: state.state, isRecording, manualPaused: state.manualPaused };
});

ipcMain.handle('screenStills:pause', async () => {
    const result = await pauseScreenStills();
    const state = screenStillsController?.getState?.() || { state: 'disabled', manualPaused: false };
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    return { ...result, state: state.state, isRecording, manualPaused: state.manualPaused };
});

ipcMain.handle('screenStills:stop', async () => {
    console.warn('screenStills:stop called; treating as pause');
    const result = await pauseScreenStills();
    const state = screenStillsController?.getState?.() || { state: 'disabled', manualPaused: false };
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    return { ...result, state: state.state, isRecording, manualPaused: state.manualPaused };
});

ipcMain.handle('screenStills:simulateHotkey', async () => {
    if (!isE2E) {
        return { ok: false, message: 'Hotkey simulation is only available in E2E mode.' };
    }
    const result = await handleCaptureHotkey();
    return { ok: true, result };
});

ipcMain.handle('screenStills:simulateIdle', (_event, payload = {}) => {
    if (!isE2E) {
        return { ok: false, message: 'Idle simulation is only available in E2E mode.' };
    }
    const idleSeconds = typeof payload.idleSeconds === 'number' ? payload.idleSeconds : undefined;
    if (screenStillsController && typeof screenStillsController.simulateIdle === 'function') {
        screenStillsController.simulateIdle(idleSeconds);
    }
    return { ok: true };
});

app.whenReady().then(() => {
    if (process.platform !== 'darwin' && !isE2E) {
        console.error('Jiminy desktop app is macOS-only right now.');
        app.quit();
        return;
    }

    if (process.platform === 'darwin') {
        if (app.dock) {
            app.dock.hide();
        }
        app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

        createTray();
        registerHotkeysFromSettings();
        presenceMonitor = createPresenceMonitor({ logger: console });
        if (pauseDurationOverrideMs) {
            console.log('Screen capture pause duration override enabled', {
                pauseDurationMs: pauseDurationOverrideMs
            });
        }
        screenStillsController = createScreenStillsController({
            logger: console,
            onError: handleStillsError,
            presenceMonitor,
            ...(pauseDurationOverrideMs ? { pauseDurationMs: pauseDurationOverrideMs } : {})
        });
        screenStillsController.start();
        updateScreenCaptureFromSettings();

        const updateState = initializeAutoUpdater({ isE2E, isCI });
        if (updateState.enabled) {
            scheduleDailyUpdateCheck();
        }
    } else if (isE2E) {
        console.log('E2E mode: running on non-macOS platform');
    }

    if (isE2E) {
        console.log('E2E mode: opening settings window');
        showSettingsWindow({ focus: false, reason: 'e2e' });
    }

    app.on('activate', () => {
        // Keep background-only behavior; open Settings only from the tray menu.
    });
});

app.on('before-quit', (event) => {
    isQuitting = true;
    if (screenStillsController) {
        const stillsState = screenStillsController?.getState?.().state;
        const isStills = stillsState === 'recording' || stillsState === 'idleGrace';
        if (isStills && !recordingShutdownInProgress) {
            recordingShutdownInProgress = true;
            event.preventDefault();
            const shutdowns = [];
            if (screenStillsController) {
                shutdowns.push(
                    screenStillsController.shutdown('quit').catch((error) => {
                        console.error('Failed to stop recording on quit', error);
                    })
                );
            }
            Promise.allSettled(shutdowns)
                .finally(() => {
                    screenStillsController?.dispose?.();
                    app.quit();
                });
            return;
        }
        screenStillsController?.dispose?.();
    }
    unregisterGlobalHotkeys();
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in main process', error);
    attemptScreenCaptureShutdown('crash');
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection in main process', reason);
    attemptScreenCaptureShutdown('crash');
});

app.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone', details);
    attemptScreenCaptureShutdown('renderer-gone');
});

app.on('window-all-closed', (event) => {
    if (process.platform === 'darwin') {
        if (isQuitting || app.isQuittingForUpdate) {
            return;
        }
        event.preventDefault();
        console.log('preventing app from exiting when all windows are closed');
        return;
    }

    if (!isE2E) {
        app.quit();
    }
});
