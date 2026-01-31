const { app, BrowserWindow, Tray, dialog, nativeImage, ipcMain } = require('electron');
const path = require('node:path');

const { registerIpcHandlers } = require('./ipc');
const { registerCaptureHandlers, startCaptureFlow, closeOverlayWindow } = require('./screenshot/capture');
const { captureClipboard } = require('./clipboard');
const {
    registerCaptureHotkey,
    registerClipboardHotkey,
    registerRecordingHotkey,
    unregisterGlobalHotkeys,
    DEFAULT_CAPTURE_HOTKEY,
    DEFAULT_CLIPBOARD_HOTKEY,
    DEFAULT_RECORDING_HOTKEY,
} = require('./hotkeys');
const { registerExtractionHandlers } = require('./extraction');
const { registerAnalysisHandlers } = require('./analysis');
const { showWindow } = require('./utils/window');
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

const trayIconPath = path.join(__dirname, 'icon.png');

let tray = null;
let trayHandlers = null;
let trayBusyIndicator = null;
let trayMenuController = null;
let settingsWindow = null;
let isQuitting = false;
let screenRecordingController = null;
let recordingShutdownInProgress = false;

const isE2E = process.env.JIMINY_E2E === '1';
const isCI = process.env.CI === 'true' || process.env.CI === '1';

initLogging();

const updateScreenRecordingFromSettings = () => {
    if (!screenRecordingController) {
        return;
    }
    const settings = loadSettings();
    screenRecordingController.updateSettings({
        enabled: settings.alwaysRecordWhenActive === true,
        contextFolderPath: typeof settings.contextFolderPath === 'string' ? settings.contextFolderPath : ''
    });
};

const attemptRecordingShutdown = (reason) => {
    if (!screenRecordingController) {
        return;
    }
    screenRecordingController.shutdown(reason)
        .catch((error) => {
            console.error('Failed to stop screen recording', error);
        });
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
        if (!isQuitting) {
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
    const { captureAccelerator, clipboardAccelerator, recordingAccelerator } = resolveHotkeyAccelerators(settings, {
        DEFAULT_CAPTURE_HOTKEY,
        DEFAULT_CLIPBOARD_HOTKEY,
        DEFAULT_RECORDING_HOTKEY,
    });

    unregisterGlobalHotkeys();

    const captureResult = registerCaptureHotkey({
        onCapture: () => {
            void startCaptureFlow();
        },
        accelerator: captureAccelerator,
    });
    if (!captureResult.ok) {
        console.warn('Capture hotkey inactive', {
            reason: captureResult.reason,
            accelerator: captureResult.accelerator,
        });
        showToast({
            title: 'Capture hotkey inactive',
            body: 'The capture shortcut could not be registered. Open Settings to update it.',
            type: 'warning',
            size: 'large'
        });
    }

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
            if (!screenRecordingController) {
                console.warn('Recording hotkey ignored: controller unavailable');
                return;
            }
            const state = screenRecordingController.getState();
            const isRecording = state.state === 'recording' || state.state === 'idleGrace';
            if (isRecording) {
                screenRecordingController.manualStop()
                    .then((result) => {
                        if (result && result.ok === false) {
                            showToast({
                                title: 'Screen recording',
                                body: result.message || 'Failed to stop recording.',
                                type: 'warning',
                                size: 'large'
                            });
                        }
                    })
                    .catch((error) => {
                        console.error('Failed to stop screen recording via hotkey', error);
                        showToast({
                            title: 'Screen recording',
                            body: 'Failed to stop recording.',
                            type: 'warning',
                            size: 'large'
                        });
                    });
                return;
            }
            screenRecordingController.manualStart()
                .then((result) => {
                    if (result && result.ok === false) {
                        showToast({
                            title: 'Screen recording',
                            body: result.message || 'Failed to start recording.',
                            type: 'warning',
                            size: 'large'
                        });
                    }
                })
                .catch((error) => {
                    console.error('Failed to start screen recording via hotkey', error);
                    showToast({
                        title: 'Screen recording',
                        body: 'Failed to start recording.',
                        type: 'warning',
                        size: 'large'
                    });
                });
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
        captureResult,
        clipboardResult,
        recordingResult,
        captureAccelerator,
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
        onCapture: () => {
            void startCaptureFlow();
        },
        onClipboard: () => {
            void captureClipboard();
        },
        onOpenSettings: showSettingsWindow,
        onAbout: showAboutDialog,
        onRestart: restartApp,
        onQuit: quitApp,
    };

    trayMenuController = createTrayMenuController({
        tray,
        trayHandlers,
        DEFAULT_CAPTURE_HOTKEY,
        DEFAULT_CLIPBOARD_HOTKEY,
        DEFAULT_RECORDING_HOTKEY,
    });

    trayMenuController.refreshTrayMenuFromSettings();
    trayMenuController.registerTrayRefreshHandlers();

    console.log('Tray created');
}

// Register all IPC handlers
registerIpcHandlers({ onSettingsSaved: updateScreenRecordingFromSettings });
registerCaptureHandlers();
registerExtractionHandlers();
registerAnalysisHandlers();

// IPC handler for hotkey re-registration
ipcMain.handle('hotkeys:reregister', () => {
    console.log('Re-registering hotkeys from settings');
    const result = registerHotkeysFromSettings();
    if (trayMenuController) {
        trayMenuController.updateTrayMenu({
            captureAccelerator: result.captureAccelerator,
            clipboardAccelerator: result.clipboardAccelerator,
        });
    } else {
        console.warn('Tray menu update skipped: controller not ready');
    }
    return {
        ok: result.captureResult.ok && result.clipboardResult.ok && result.recordingResult.ok,
        captureHotkey: result.captureResult,
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
            captureAccelerator: result.captureAccelerator,
            clipboardAccelerator: result.clipboardAccelerator,
        });
    } else {
        console.warn('Tray menu update skipped: controller not ready');
    }
    return {
        ok: result.captureResult.ok && result.clipboardResult.ok && result.recordingResult.ok,
        captureHotkey: result.captureResult,
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
    return { ok: true, state: state.state, isRecording };
});

ipcMain.handle('screenRecording:start', async () => {
    if (!screenRecordingController) {
        return { ok: false, message: 'Recording controller unavailable.' };
    }
    const result = await screenRecordingController.manualStart();
    const state = screenRecordingController.getState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    return { ...result, state: state.state, isRecording };
});

ipcMain.handle('screenRecording:stop', async () => {
    if (!screenRecordingController) {
        return { ok: false, message: 'Recording controller unavailable.' };
    }
    const result = await screenRecordingController.manualStop();
    const state = screenRecordingController.getState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    return { ...result, state: state.state, isRecording };
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
        screenRecordingController = createScreenRecordingController({
            logger: console,
            onError: ({ message }) => {
                if (!message) {
                    return;
                }
                showToast({
                    title: 'Screen recording issue',
                    body: message,
                    type: 'warning',
                    size: 'large'
                });
            }
        });
        screenRecordingController.start();
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
    if (screenRecordingController) {
        const state = screenRecordingController.getState().state;
        const isRecording = state === 'recording' || state === 'idleGrace';
        if (isRecording && !recordingShutdownInProgress) {
            recordingShutdownInProgress = true;
            event.preventDefault();
            screenRecordingController.shutdown('quit')
                .catch((error) => {
                    console.error('Failed to stop screen recording on quit', error);
                })
                .finally(() => {
                    screenRecordingController.dispose();
                    app.quit();
                });
            return;
        }
        screenRecordingController.dispose();
    }
    unregisterGlobalHotkeys();
    closeOverlayWindow();
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
        event.preventDefault();
        console.log('preventing app from exiting when all windows are closed');
        return;
    }

    if (!isE2E) {
        app.quit();
    }
});
