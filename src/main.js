const {
    app,
    BrowserWindow,
    Tray,
    nativeImage,
    ipcMain,
    nativeTheme
} = require('electron');
const path = require('node:path');

const { registerIpcHandlers } = require('./ipc');
const { showWindow } = require('./utils/window');
const { ensureHomebrewPath } = require('./utils/path');
const { loadSettings, saveSettings } = require('./settings');
const { buildTrayMenuTemplate } = require('./menu');
const { initLogging } = require('./logger');
const { showToast } = require('./toast');
const {
    createRecordingOffReminder,
    DEFAULT_RECORDING_OFF_REMINDER_DELAY_MS
} = require('./recording-off-reminder');
const {
    createTrayMenuController,
} = require('./tray/refresh');
const { initializeAutoUpdater, scheduleDailyUpdateCheck } = require('./updates');
const { createScreenStillsController } = require('./screen-stills');
const { createPresenceMonitor } = require('./screen-capture/presence');
const { getScreenRecordingPermissionStatus } = require('./screen-capture/permissions');
const { getTrayIconPathForMenuBar } = require('./tray/icon');

const trayIconPath = path.join(__dirname, 'icon_white_owl.png');

let tray = null;
let trayHandlers = null;
let trayMenuController = null;
let settingsWindow = null;
let isQuitting = false;
let screenStillsController = null;
let presenceMonitor = null;
let recordingShutdownInProgress = false;
let recordingOffReminder = null;
const e2eToastEvents = [];
const E2E_TOAST_EVENT_LIMIT = 20;

const parsePositiveInteger = (value) => {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return Math.floor(parsed);
};

const recordE2EToastEvent = (payload = {}) => {
    if (!isE2E) {
        return;
    }

    e2eToastEvents.push({
        title: typeof payload.title === 'string' ? payload.title : '',
        body: typeof payload.body === 'string' ? payload.body : '',
        type: typeof payload.type === 'string' ? payload.type : 'info',
        size: typeof payload.size === 'string' ? payload.size : 'compact',
        duration: Number.isFinite(payload.duration) && payload.duration > 0
            ? Math.floor(payload.duration)
            : null,
        at: Date.now()
    });

    if (e2eToastEvents.length > E2E_TOAST_EVENT_LIMIT) {
        e2eToastEvents.splice(0, e2eToastEvents.length - E2E_TOAST_EVENT_LIMIT);
    }
};

const maybeE2EToast = (payload = {}) => {
    if (!payload || typeof payload !== 'object') {
        showToast(payload);
        return;
    }
    recordE2EToastEvent(payload);
    showToast(payload);
};

const isE2E = process.env.FAMILIAR_E2E === '1';
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
    return parsePauseOverride(process.env.FAMILIAR_E2E_PAUSE_MS)
      ?? parsePauseOverride(process.env.FAMILIAR_RECORDING_PAUSE_MS);
    })();

const recordingOffReminderDelayMs = (() => {
    const override = parsePositiveInteger(process.env.FAMILIAR_RECORDING_OFF_REMINDER_DELAY_MS);
    if (override !== null) {
        console.log('Recording-off reminder delay override enabled', {
            delayMs: override,
            reason: 'FAMILIAR_RECORDING_OFF_REMINDER_DELAY_MS'
        });
        return override;
    }

    return DEFAULT_RECORDING_OFF_REMINDER_DELAY_MS;
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
        console.warn('Capturing issue (retrying)', { message, retryDelayMs, attempt });
        return;
    }

    console.warn('Capturing issue', { message });
    showToast({
        title: 'Capturing issue',
        body: willRetry === true && Number.isFinite(retryDelayMs)
            ? `${message}\nRetrying in ${Math.round(retryDelayMs / 1000)}s...`
            : message,
        type: 'warning',
        size: 'large'
    });
};

const handleRecordingOffReminderTransition = (transition) => {
    if (!recordingOffReminder || typeof recordingOffReminder.handleStateTransition !== 'function') {
        return;
    }
    recordingOffReminder.handleStateTransition(transition);
};

const syncRecordingOffReminderState = () => {
    if (!recordingOffReminder || typeof recordingOffReminder.syncWithCurrentState !== 'function') {
        return;
    }
    recordingOffReminder.syncWithCurrentState(getCurrentScreenStillsState());
};

const startScreenStills = async () => {
    if (!screenStillsController) {
        return { ok: true, skipped: true };
    }
    try {
        const result = await screenStillsController.manualStart();
        if (result && result.ok === false) {
            handleStillsError({ message: result.message || 'Failed to start capturing.' });
        }
        return result;
    } catch (error) {
        console.error('Failed to start capturing', error);
        handleStillsError({ message: 'Failed to start capturing.' });
        return { ok: false, message: 'Failed to start capturing.' };
    }
};

const pauseScreenStills = async () => {
    if (!screenStillsController) {
        return { ok: true, skipped: true };
    }
    try {
        const result = await screenStillsController.manualPause();
        if (result && result.ok === false) {
            handleStillsError({ message: result.message || 'Failed to pause capturing.' });
        }
        return result;
    } catch (error) {
        console.error('Failed to pause capturing', error);
        handleStillsError({ message: 'Failed to pause capturing.' });
        return { ok: false, message: 'Failed to pause capturing.' };
    }
};

const refreshTrayMenu = () => {
    if (trayMenuController && typeof trayMenuController.refreshTrayMenuFromSettings === 'function') {
        trayMenuController.refreshTrayMenuFromSettings();
    }
};

const handleRecordingToggleAction = async () => {
    if (!screenStillsController) {
        console.warn('Recording toggle action ignored: controller unavailable');
        return { ok: false, message: 'Capture controller unavailable.' };
    }
    const state = screenStillsController.getState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';
    const isPaused = state.manualPaused === true;

    if (isPaused) {
        const result = await startScreenStills();
        refreshTrayMenu();
        return result;
    }

    if (isRecording) {
        const result = await pauseScreenStills();
        refreshTrayMenu();
        return result;
    }

    if (state.enabled !== true) {
        try {
            saveSettings({ alwaysRecordWhenActive: true });
            updateScreenCaptureFromSettings();
            if (settingsWindow && !settingsWindow.isDestroyed()) {
                settingsWindow.webContents.send('settings:alwaysRecordWhenActiveChanged', {
                    enabled: true
                });
            }
        } catch (error) {
            console.error('Failed to enable capturing from tray action', error);
            return { ok: false, message: 'Failed to enable capturing.' };
        }
    }

    const result = await startScreenStills();
    refreshTrayMenu();
    return result;
};

const getCurrentScreenStillsState = () => {
    const baseState = screenStillsController?.getState?.() || {
        enabled: false,
        contextFolderPath: '',
        state: 'disabled',
        manualPaused: false
    };
    const permissionStatus = getScreenRecordingPermissionStatus();
    return {
        ...baseState,
        permissionStatus,
        permissionGranted: permissionStatus === 'granted'
    };
};

const getScreenStillsStatusPayload = () => {
    const state = getCurrentScreenStillsState();
    const isRecording = state.state === 'recording' || state.state === 'idleGrace';

    return {
        ok: true,
        state: state.state,
        isRecording,
        enabled: state.enabled === true,
        manualPaused: state.manualPaused,
        permissionStatus: state.permissionStatus,
        permissionGranted: state.permissionGranted
    };
};

const getTrayRecordingActionLabel = () => {
    if (!trayHandlers) {
        return '';
    }
    const recordingState = getCurrentScreenStillsState();
    const template = buildTrayMenuTemplate({
        ...trayHandlers,
        recordingPaused: recordingState.manualPaused === true,
        recordingState,
    });
    return template && template[0] && typeof template[0].label === 'string'
        ? template[0].label
        : '';
};

const runCaptureActionAndRefreshTray = async (action) => {
    const result = await action();
    refreshTrayMenu();
    return result;
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
        width: 774,
        height: 528,
        minWidth: 560,
        minHeight: 460,
        resizable: true,
        fullscreenable: false,
        minimizable: false,
        show: false,
        title: 'Familiar Settings',
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

function quitApp() {
    console.log('Quitting app');
    app.quit();
}

function createTray() {
    const getTrayIcon = () => {
        const preferredPath = getTrayIconPathForMenuBar({
            defaultIconPath: trayIconPath
        });

        const trayIconBase = nativeImage.createFromPath(preferredPath);
        if (!trayIconBase.isEmpty()) {
            const trayIcon = trayIconBase.resize({ width: 16, height: 16 });
            if (process.platform === 'darwin') {
                trayIcon.setTemplateImage(true);
            }
            return trayIcon;
        }

        if (preferredPath !== trayIconPath) {
            console.warn(`Tray icon failed to load from ${preferredPath}; falling back to ${trayIconPath}`);
            const fallbackTrayIcon = nativeImage.createFromPath(trayIconPath);
            if (!fallbackTrayIcon.isEmpty()) {
                return fallbackTrayIcon.resize({ width: 16, height: 16 });
            }
        } else {
            console.error(`Tray icon failed to load from ${trayIconPath}`);
        }

        return nativeImage.createEmpty();
    };

    const updateTrayIcon = () => {
        const trayIcon = getTrayIcon();
        if (trayIcon.isEmpty()) {
            console.error('Failed to resolve any tray icon image');
            return;
        }
        if (tray) {
            tray.setImage(trayIcon);
        }
    };

    const trayIcon = getTrayIcon();
    if (trayIcon.isEmpty()) {
        console.error('Failed to initialize tray due to missing icon assets');
        return;
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('Familiar');
    nativeTheme.on('updated', updateTrayIcon);

    trayHandlers = {
        onRecordingPause: () => {
            void handleRecordingToggleAction();
        },
        onOpenSettings: showSettingsWindow,
        onQuit: quitApp,
    };

    trayMenuController = createTrayMenuController({
        tray,
        trayHandlers,
        getRecordingState: getCurrentScreenStillsState,
    });

    trayMenuController.refreshTrayMenuFromSettings();
    trayMenuController.registerTrayRefreshHandlers();
    updateTrayIcon();

    console.log('Tray created');
}

// Register all IPC handlers
registerIpcHandlers({ onSettingsSaved: updateScreenCaptureFromSettings });

ipcMain.handle('screenStills:getStatus', () => {
    if (!screenStillsController) {
        const state = getCurrentScreenStillsState();
        return {
            ok: false,
            state: 'disabled',
            isRecording: false,
            enabled: state.enabled === true,
            permissionStatus: state.permissionStatus,
            permissionGranted: state.permissionGranted
        };
    }
    return getScreenStillsStatusPayload();
});

ipcMain.handle('screenStills:start', async () => {
    const result = await runCaptureActionAndRefreshTray(startScreenStills);
    return {
        ...result,
        ...getScreenStillsStatusPayload()
    };
});

ipcMain.handle('screenStills:pause', async () => {
    const result = await runCaptureActionAndRefreshTray(pauseScreenStills);
    return {
        ...result,
        ...getScreenStillsStatusPayload()
    };
});

ipcMain.handle('screenStills:stop', async () => {
    console.warn('screenStills:stop called; treating as pause');
    const result = await runCaptureActionAndRefreshTray(pauseScreenStills);
    return {
        ...result,
        ...getScreenStillsStatusPayload()
    };
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

ipcMain.handle('e2e:toast:events', (_event, options = {}) => {
    if (!isE2E) {
        return { ok: false, message: 'Toast E2E API is only available in E2E mode.' };
    }

    const clear = options?.clear === true;
    const events = [...e2eToastEvents];
    if (clear) {
        e2eToastEvents.length = 0;
    }

    return { ok: true, events };
});

ipcMain.handle('e2e:tray:getRecordingLabel', () => {
    if (!isE2E) {
        return { ok: false, message: 'Tray E2E action is only available in E2E mode.' };
    }
    return {
        ok: true,
        label: getTrayRecordingActionLabel()
    };
});

ipcMain.handle('e2e:tray:clickRecordingAction', async () => {
    if (!isE2E) {
        return { ok: false, message: 'Tray E2E action is only available in E2E mode.' };
    }
    const actionResult = await handleRecordingToggleAction();
    return {
        ok: true,
        actionResult,
        label: getTrayRecordingActionLabel(),
        status: getScreenStillsStatusPayload()
    };
});

app.whenReady().then(() => {
    if (process.platform !== 'darwin' && !isE2E) {
        console.error('Familiar desktop app is macOS-only right now.');
        app.quit();
        return;
    }

    const shouldInitializeRecording = process.platform === 'darwin' || isE2E;
    if (shouldInitializeRecording) {
        presenceMonitor = createPresenceMonitor({ logger: console });
        if (pauseDurationOverrideMs) {
            console.log('Screen capture pause duration override enabled', {
                pauseDurationMs: pauseDurationOverrideMs
            });
        }
        screenStillsController = createScreenStillsController({
            logger: console,
            onError: handleStillsError,
            onStateTransition: handleRecordingOffReminderTransition,
            presenceMonitor,
            ...(pauseDurationOverrideMs ? { pauseDurationMs: pauseDurationOverrideMs } : {})
        });
        recordingOffReminder = createRecordingOffReminder({
            delayMs: recordingOffReminderDelayMs,
            showToast: maybeE2EToast
        });
        screenStillsController.start();
        syncRecordingOffReminderState();
        updateScreenCaptureFromSettings();
    }

    if (process.platform === 'darwin') {
        app.dock?.show();
        app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

        createTray();
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
        showSettingsWindow({ reason: 'activate' });
    });
});

app.on('before-quit', (event) => {
    if (recordingOffReminder && typeof recordingOffReminder.stopReminder === 'function') {
        recordingOffReminder.stopReminder();
    }
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
