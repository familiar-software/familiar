const { app, BrowserWindow, Tray, dialog, nativeImage, ipcMain } = require('electron');
const path = require('node:path');

const { registerIpcHandlers } = require('./ipc');
const { captureClipboard } = require('./clipboard');
const {
    registerClipboardHotkey,
    registerRecordingHotkey,
    unregisterGlobalHotkeys,
    DEFAULT_CLIPBOARD_HOTKEY,
    DEFAULT_RECORDING_HOTKEY,
} = require('./hotkeys');
const { registerExtractionHandlers } = require('./extraction');
const { registerAnalysisHandlers } = require('./analysis');
const { showWindow } = require('./utils/window');
const { ensureHomebrewPath } = require('./utils/path');
const { loadSettings } = require('./settings');
const { initLogging } = require('./logger');
const { showToast } = require('./toast');
const { registerTrayBusyIndicator } = require('./tray/busy');
const {
    resolveHotkeyAccelerators,
    createTrayMenuController,
} = require('./tray/refresh');
const { initializeAutoUpdater, installDownloadedUpdate, scheduleDailyUpdateCheck } = require('./updates');
const { createScreenRecordingController } = require('./screen-recording');
const { createScreenStillsController } = require('./screen-stills');
const { createPresenceMonitor } = require('./screen-recording/presence');

const trayIconPath = path.join(__dirname, 'icon.png');

let tray = null;
let trayHandlers = null;
let trayBusyIndicator = null;
let trayMenuController = null;
let settingsWindow = null;
let isQuitting = false;
let screenRecordingController = null;
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

const updateScreenRecordingFromSettings = () => {
    if (!screenRecordingController && !screenStillsController) {
        return;
    }
    const settings = loadSettings();
    const payload = {
        enabled: settings.alwaysRecordWhenActive === true,
        contextFolderPath: typeof settings.contextFolderPath === 'string' ? settings.contextFolderPath : ''
    };
    if (screenRecordingController) {
        screenRecordingController.updateSettings(payload);
    }
    if (screenStillsController) {
        screenStillsController.updateSettings(payload);
    }
};

const attemptRecordingShutdown = (reason) => {
    const controllers = [screenRecordingController, screenStillsController].filter(Boolean);
    if (controllers.length === 0) {
        return;
    }
    controllers.forEach((controller) => {
        controller.shutdown(reason)
            .catch((error) => {
                console.error('Failed to stop screen capture', error);
            });
    });
};

const handleRecordingError = ({ message }) => {
    if (!message) {
        return;
    }
    console.warn('Screen recording issue', { message });
    showToast({
        title: 'Screen recording issue',
        body: message,
        type: 'warning',
        size: 'large'
    });
};

const handleStillsError = ({ message }) => {
    if (!message) {
        return;
    }
    console.warn('Screen stills issue', { message });
    showToast({
        title: 'Screen stills issue',
        body: message,
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
            handleStillsError({ message: result.message || 'Failed to start screen stills.' });
        }
        return result;
    } catch (error) {
        console.error('Failed to start screen stills', error);
        handleStillsError({ message: 'Failed to start screen stills.' });
        return { ok: false, message: 'Failed to start screen stills.' };
    }
};

const resumeScreenRecording = async () => {
    if (!screenRecordingController) {
        return { ok: false, message: 'Recording controller unavailable.' };
    }
    try {
        const result = await screenRecordingController.manualStart();
        if (result && result.ok === false) {
            showToast({
                title: 'Screen recording',
                body: result.message || 'Failed to resume recording.',
                type: 'warning',
                size: 'large'
            });
        }
        return result;
    } catch (error) {
        console.error('Failed to resume screen recording', error);
        showToast({
            title: 'Screen recording',
            body: 'Failed to resume recording.',
            type: 'warning',
            size: 'large'
        });
        return { ok: false, message: 'Failed to resume recording.' };
    }
};

const pauseScreenRecording = async () => {
    if (!screenRecordingController) {
        return { ok: false, message: 'Recording controller unavailable.' };
    }
    try {
        const result = await screenRecordingController.manualPause();
        if (result && result.ok === false) {
            showToast({
                title: 'Screen recording',
                body: result.message || 'Failed to pause recording.',
                type: 'warning',
                size: 'large'
            });
        }
        return result;
    } catch (error) {
        console.error('Failed to pause screen recording', error);
        showToast({
            title: 'Screen recording',
            body: 'Failed to pause recording.',
            type: 'warning',
            size: 'large'
        });
        return { ok: false, message: 'Failed to pause recording.' };
    }
};

const pauseScreenStills = async () => {
    if (!screenStillsController) {
        return { ok: true, skipped: true };
    }
    try {
        const result = await screenStillsController.manualPause();
        if (result && result.ok === false) {
            handleStillsError({ message: result.message || 'Failed to pause screen stills.' });
        }
        return result;
    } catch (error) {
        console.error('Failed to pause screen stills', error);
        handleStillsError({ message: 'Failed to pause screen stills.' });
        return { ok: false, message: 'Failed to pause screen stills.' };
    }
};

const handleRecordingHotkey = async () => {
    if (!screenRecordingController) {
        console.warn('Recording hotkey ignored: controller unavailable');
        return { ok: false, message: 'Recording controller unavailable.' };
    }
    const state = screenRecordingController.getState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    const isPaused = state.manualPaused === true;

    if (isPaused) {
        await startScreenStills();
        return resumeScreenRecording();
    }

    if (isRecording) {
        await pauseScreenStills();
        return pauseScreenRecording();
    }

    await startScreenStills();
    return resumeScreenRecording();
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
        width: 624,
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
        detail: `Menu bar app shell (macOS).\nVersion ${version}`,
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
    const { clipboardAccelerator, recordingAccelerator } = resolveHotkeyAccelerators(settings, {
        DEFAULT_CLIPBOARD_HOTKEY,
        DEFAULT_RECORDING_HOTKEY,
    });

    unregisterGlobalHotkeys();

    const clipboardResult = registerClipboardHotkey({
        onClipboard: () => {
            void captureClipboard();
        },
        accelerator: clipboardAccelerator,
    });
    if (!clipboardResult.ok) {
        console.warn('Clipboard hotkey inactive', {
            reason: clipboardResult.reason,
            accelerator: clipboardResult.accelerator,
        });
        showToast({
            title: 'Clipboard hotkey inactive',
            body: 'The clipboard shortcut could not be registered. Open Settings to update it.',
            type: 'warning',
            size: 'large'
        });
    }

    const recordingResult = registerRecordingHotkey({
        onRecording: () => {
            void handleRecordingHotkey();
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
        clipboardResult,
        recordingResult,
        clipboardAccelerator,
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
    trayBusyIndicator = registerTrayBusyIndicator({ tray, baseIcon: trayIcon });

    trayHandlers = {
        onClipboard: () => {
            void captureClipboard();
        },
        onRecordingPause: () => {
            void handleRecordingHotkey();
        },
        onOpenSettings: showSettingsWindow,
        onAbout: showAboutDialog,
        onRestart: restartApp,
        onQuit: quitApp,
    };

    trayMenuController = createTrayMenuController({
        tray,
        trayHandlers,
        DEFAULT_CLIPBOARD_HOTKEY,
        DEFAULT_RECORDING_HOTKEY,
        getRecordingState: () => screenRecordingController?.getState?.(),
    });

    trayMenuController.refreshTrayMenuFromSettings();
    trayMenuController.registerTrayRefreshHandlers();

    console.log('Tray created');
}

// Register all IPC handlers
registerIpcHandlers({ onSettingsSaved: updateScreenRecordingFromSettings });
registerExtractionHandlers();
registerAnalysisHandlers();

// IPC handler for hotkey re-registration
    ipcMain.handle('hotkeys:reregister', () => {
        console.log('Re-registering hotkeys from settings');
        const result = registerHotkeysFromSettings();
        if (trayMenuController) {
            trayMenuController.updateTrayMenu({
                clipboardAccelerator: result.clipboardAccelerator,
                recordingAccelerator: result.recordingAccelerator,
            });
        } else {
            console.warn('Tray menu update skipped: controller not ready');
        }
    return {
        ok: result.clipboardResult.ok && result.recordingResult.ok,
        clipboardHotkey: result.clipboardResult,
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
            clipboardAccelerator: result.clipboardAccelerator,
            recordingAccelerator: result.recordingAccelerator,
        });
    } else {
        console.warn('Tray menu update skipped: controller not ready');
    }
    return {
        ok: result.clipboardResult.ok && result.recordingResult.ok,
        clipboardHotkey: result.clipboardResult,
        recordingHotkey: result.recordingResult,
    };
});

ipcMain.handle('screenRecording:getStatus', () => {
    if (!screenRecordingController) {
        return { ok: false, state: 'disabled', isRecording: false };
    }
    const state = screenRecordingController.getState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    return { ok: true, state: state.state, isRecording, manualPaused: state.manualPaused };
});

ipcMain.handle('screenRecording:start', async () => {
    if (!screenRecordingController) {
        return { ok: false, message: 'Recording controller unavailable.' };
    }
    const [result] = await Promise.all([
        screenRecordingController.manualStart(),
        startScreenStills()
    ]);
    const state = screenRecordingController.getState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    return { ...result, state: state.state, isRecording, manualPaused: state.manualPaused };
});

ipcMain.handle('screenRecording:pause', async () => {
    if (!screenRecordingController) {
        return { ok: false, message: 'Recording controller unavailable.' };
    }
    const [result] = await Promise.all([
        pauseScreenRecording(),
        pauseScreenStills()
    ]);
    const state = screenRecordingController.getState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    return { ...result, state: state.state, isRecording, manualPaused: state.manualPaused };
});

ipcMain.handle('screenRecording:stop', async () => {
    console.warn('screenRecording:stop called; treating as pause');
    if (!screenRecordingController) {
        return { ok: false, message: 'Recording controller unavailable.' };
    }
    const [result] = await Promise.all([
        pauseScreenRecording(),
        pauseScreenStills()
    ]);
    const state = screenRecordingController.getState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    return { ...result, state: state.state, isRecording, manualPaused: state.manualPaused };
});

ipcMain.handle('screenRecording:simulateHotkey', async () => {
    if (!isE2E) {
        return { ok: false, message: 'Hotkey simulation is only available in E2E mode.' };
    }
    const result = await handleRecordingHotkey();
    return { ok: true, result };
});

ipcMain.handle('screenRecording:simulateIdle', (_event, payload = {}) => {
    if (!isE2E) {
        return { ok: false, message: 'Idle simulation is only available in E2E mode.' };
    }
    if (!screenRecordingController || typeof screenRecordingController.simulateIdle !== 'function') {
        return { ok: false, message: 'Recording controller unavailable.' };
    }
    const idleSeconds = typeof payload.idleSeconds === 'number' ? payload.idleSeconds : undefined;
    screenRecordingController.simulateIdle(idleSeconds);
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
        screenRecordingController = createScreenRecordingController({
            logger: console,
            onError: handleRecordingError,
            presenceMonitor,
            ...(pauseDurationOverrideMs ? { pauseDurationMs: pauseDurationOverrideMs } : {})
        });
        screenStillsController = createScreenStillsController({
            logger: console,
            onError: handleStillsError,
            presenceMonitor,
            ...(pauseDurationOverrideMs ? { pauseDurationMs: pauseDurationOverrideMs } : {})
        });
        screenRecordingController.start();
        screenStillsController.start();
        updateScreenRecordingFromSettings();

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
    if (trayBusyIndicator) {
        trayBusyIndicator.dispose();
    }
    if (screenRecordingController || screenStillsController) {
        const recordingState = screenRecordingController?.getState?.().state;
        const stillsState = screenStillsController?.getState?.().state;
        const isRecording = recordingState === 'recording' || recordingState === 'idleGrace';
        const isStills = stillsState === 'recording' || stillsState === 'idleGrace';
        if ((isRecording || isStills) && !recordingShutdownInProgress) {
            recordingShutdownInProgress = true;
            event.preventDefault();
            const shutdowns = [];
            if (screenRecordingController) {
                shutdowns.push(
                    screenRecordingController.shutdown('quit').catch((error) => {
                        console.error('Failed to stop screen recording on quit', error);
                    })
                );
            }
            if (screenStillsController) {
                shutdowns.push(
                    screenStillsController.shutdown('quit').catch((error) => {
                        console.error('Failed to stop screen stills on quit', error);
                    })
                );
            }
            Promise.allSettled(shutdowns)
                .finally(() => {
                    screenRecordingController?.dispose?.();
                    screenStillsController?.dispose?.();
                    app.quit();
                });
            return;
        }
        screenRecordingController?.dispose?.();
        screenStillsController?.dispose?.();
    }
    unregisterGlobalHotkeys();
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in main process', error);
    attemptRecordingShutdown('crash');
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection in main process', reason);
    attemptRecordingShutdown('crash');
});

app.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone', details);
    attemptRecordingShutdown('renderer-gone');
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
