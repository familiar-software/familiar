const {
    app,
    BrowserWindow,
    Tray,
    nativeImage,
    ipcMain,
    nativeTheme
} = require('electron');
const { existsSync } = require('node:fs');
const path = require('node:path');

const { registerIpcHandlers } = require('./ipc');
const { showWindow } = require('./utils/window');
const { ensureHomebrewPath } = require('./utils/path');
const { loadSettings, saveSettings, validateContextFolderPath, resolveSettingsDir } = require('./settings');
const { buildTrayMenuTemplate } = require('./menu');
const { ensureFamiliarSkillAlignment } = require('./skills/familiar-skill-alignment');
const { initLogging } = require('./logger');
const { showToast } = require('./toast');
const {
    createRecordingOffReminder,
    DEFAULT_RECORDING_OFF_REMINDER_DELAY_MS
} = require('./recording-off-reminder');
const {
    createTrayMenuController,
} = require('./tray/refresh');
const { initializeAutoUpdater, scheduleRecurringUpdateCheck } = require('./updates');
const { createScreenStillsController } = require('./screen-stills');
const { createPresenceMonitor } = require('./screen-capture/presence');
const { getScreenRecordingPermissionStatus } = require('./screen-capture/permissions');
const { createTrayIconFactory, getTrayIconPathForMenuBar } = require('./tray/icon');
const {
    hasUnreadHeartbeatRuns,
    loadRecentHeartbeatRuns,
    markAllHeartbeatRunsSeen
} = require('./tray/heartbeats');
const { shouldOpenSettingsOnReady } = require('./launch-intent');
const { APP_MODE, setAppMode } = require('./app-mode');
const { initializeProcessOwnership } = require('./startup/ownership');
const { microcopy } = require('./microcopy/microcopy');
const {
    createAutoSessionCleanupScheduler,
    DEFAULT_CHECK_INTERVAL_MS,
    resolveCleanupRetentionDays
} = require('./storage/auto-session-cleanup');
const { createHeartbeatScheduler } = require('./heartbeats/scheduler');
const { createHeartbeatHistoryStore } = require('./heartbeats/store');
const { buildHeartbeatFailureToastBody } = require('./heartbeats/failure-toast');
const { openFileInTextEdit } = require('./utils/open-in-textedit');
const { createRetentionChangeTrigger } = require('./storage/retention-change-trigger');
const { moveFamiliarFolder } = require('./context-folder/move');
const { createMoveContextFolderHandler } = require('./context-folder/move-handler');

const trayIconPath = path.join(__dirname, 'icon_white_owl.png');

let tray = null;
let trayHandlers = null;
let trayMenuController = null;
let refreshTrayIcon = () => {};
let resolveTrayIconStateForE2E = () => ({
    hasUnreadHeartbeats: false,
    iconPath: trayIconPath,
    isTemplateImage: process.platform === 'darwin'
});
let settingsWindow = null;
let isQuitting = false;
let screenStillsController = null;
let presenceMonitor = null;
let recordingShutdownInProgress = false;
let recordingOffReminder = null;
let autoSessionCleanupScheduler = null;
let retentionChangeTrigger = null;
let heartbeatScheduler = null;
let redactionWarningShownForCurrentRecordingSession = false;
let lastScreenCaptureSettings = {
    enabled: null,
    contextFolderPath: ''
};
const e2eToastEvents = [];
const e2eTextEditOpenEvents = [];
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

const resolveFamiliarLogPath = () => {
    return path.join(resolveSettingsDir(), 'logs', 'familiar.log');
};

const isE2E = process.env.FAMILIAR_E2E === '1';
const isCI = process.env.CI === 'true' || process.env.CI === '1';
const { isPrimaryInstance, hasOpenSettingsLaunchArg } = initializeProcessOwnership({
    app,
    isE2E,
    onSecondInstance: () => {
        openSettingsWindow({ reason: 'second-instance' });
    },
    logger: console
});

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

const autoCleanupCheckIntervalMs = (() => {
    const override = parsePositiveInteger(process.env.FAMILIAR_AUTO_CLEANUP_CHECK_INTERVAL_MS);
    if (override !== null) {
        console.log('Auto session cleanup check interval override enabled', {
            intervalMs: override,
            reason: 'FAMILIAR_AUTO_CLEANUP_CHECK_INTERVAL_MS'
        });
        return override;
    }
    return DEFAULT_CHECK_INTERVAL_MS;
})();

initLogging();
ensureHomebrewPath({ logger: console });

const enterBackgroundMode = () => setAppMode({ app, mode: APP_MODE.BACKGROUND, logger: console });
const enterForegroundMode = () => setAppMode({ app, mode: APP_MODE.FOREGROUND, logger: console });

const normalizeControllerContextFolderPath = (value) =>
    typeof value === 'string' ? value : '';

const updateScreenCaptureFromSettings = (nextSettings = null) => {
    if (!screenStillsController) {
        return;
    }

    const settings = nextSettings || loadSettings();
    const nextEnabled = settings?.alwaysRecordWhenActive === true;
    const nextContextFolderPath = normalizeControllerContextFolderPath(settings?.contextFolderPath);

    if (
        lastScreenCaptureSettings.enabled === nextEnabled &&
        lastScreenCaptureSettings.contextFolderPath === nextContextFolderPath
    ) {
        return;
    }

    lastScreenCaptureSettings = {
        enabled: nextEnabled,
        contextFolderPath: nextContextFolderPath
    };

    const payload = {
        enabled: nextEnabled,
        contextFolderPath: nextContextFolderPath
    };
    screenStillsController.updateSettings(payload);
};

const handleMainSettingsSaved = (nextSettings = null) => {
    updateScreenCaptureFromSettings(nextSettings);

    if (!retentionChangeTrigger) {
        return;
    }
    retentionChangeTrigger.handle(nextSettings?.storageAutoCleanupRetentionDays);
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
    if (transition?.toState === 'recording') {
        redactionWarningShownForCurrentRecordingSession = false;
    }
    if (!recordingOffReminder || typeof recordingOffReminder.handleStateTransition !== 'function') {
        return;
    }
    recordingOffReminder.handleStateTransition(transition);
};

const handleRedactionWarning = ({ message, fileType, fileIdentifier } = {}) => {
    const warningMessage = typeof message === 'string' && message.trim().length > 0
        ? message
        : 'Sensitive-data redaction is currently unavailable.';

    console.warn('Redaction warning', {
        message: warningMessage,
        fileType: typeof fileType === 'string' ? fileType : 'unknown',
        fileIdentifier: typeof fileIdentifier === 'string' ? fileIdentifier : null
    });

    if (redactionWarningShownForCurrentRecordingSession) {
        return;
    }
    redactionWarningShownForCurrentRecordingSession = true;
    maybeE2EToast({
        title: 'Redaction warning',
        body: `${warningMessage}\nFiles are still being saved.`,
        type: 'warning',
        size: 'large'
    });
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

const isCaptureActiveForHeartbeats = () => {
    const recordingState = getCurrentScreenStillsState();
    return recordingState.state === 'recording' || recordingState.state === 'idleGrace';
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

const notifyScreenStillsStateChanged = () => {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    return;
  }
  const payload = getScreenStillsStatusPayload();
  settingsWindow.webContents.send('settings:screenStillsStateChanged', payload);
};

const handleRecordingStateTransition = (transition) => {
  handleRecordingOffReminderTransition(transition);
  notifyScreenStillsStateChanged();
};

const getTrayRecordingActionLabel = () => {
    const template = getCurrentTrayMenuTemplate();
    return template && template[0] && typeof template[0].label === 'string'
        ? template[0].label
        : '';
};

const getCurrentTrayRecentHeartbeats = () => {
    return loadRecentHeartbeatRuns({ logger: console });
};

const getCurrentTrayMenuTemplate = () => {
    if (!trayHandlers) {
        return [];
    }
    const recordingState = getCurrentScreenStillsState();
    return buildTrayMenuTemplate({
        ...trayHandlers,
        recentHeartbeats: getCurrentTrayRecentHeartbeats(),
        recordingPaused: recordingState.manualPaused === true,
        recordingState,
    });
};

const runCaptureActionAndRefreshTray = async (action) => {
    const result = await action();
    refreshTrayMenu();
    notifyScreenStillsStateChanged();
    return result;
};

const notifyAlwaysRecordWhenActiveChanged = ({ enabled } = {}) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('settings:alwaysRecordWhenActiveChanged', { enabled });
    }
};

const notifyHeartbeatRunStateChanged = (payload = {}) => {
    if (!settingsWindow || settingsWindow.isDestroyed()) {
        return;
    }
    if (!payload || typeof payload !== 'object') {
        return;
    }
    settingsWindow.webContents.send('settings:heartbeatRunStateChanged', {
        id: typeof payload.id === 'string' ? payload.id : '',
        topic: typeof payload.topic === 'string' ? payload.topic : '',
        state: payload.state || '',
        trigger: typeof payload.trigger === 'string' ? payload.trigger : '',
        status: typeof payload.status === 'string' ? payload.status : '',
        error: typeof payload.error === 'string' ? payload.error : '',
        outputPath: typeof payload.outputPath === 'string' ? payload.outputPath : '',
        scheduledAtMs: Number.isFinite(payload.scheduledAtMs) ? payload.scheduledAtMs : null
    });
};

const openHeartbeatFromTray = async (entry = {}) => {
    const status = typeof entry.status === 'string' ? entry.status.trim().toLowerCase() : '';
    const outputPath = typeof entry.outputPath === 'string' ? entry.outputPath.trim() : '';
    const targetPath = status === 'failed' ? resolveFamiliarLogPath() : outputPath;

    if (!targetPath) {
        console.error('Heartbeat tray open skipped: missing target path', {
            heartbeatId: typeof entry.heartbeatId === 'string' ? entry.heartbeatId : '',
            status
        });
        return;
    }

    try {
        if (isE2E) {
            e2eTextEditOpenEvents.push({
                heartbeatId: typeof entry.heartbeatId === 'string' ? entry.heartbeatId : '',
                status,
                targetPath,
                at: Date.now()
            });
            console.log('Captured TextEdit open for E2E', {
                heartbeatId: typeof entry.heartbeatId === 'string' ? entry.heartbeatId : '',
                status,
                targetPath
            });
            return;
        }

        await openFileInTextEdit({ targetPath });

        console.log('Opened heartbeat tray target', {
            heartbeatId: typeof entry.heartbeatId === 'string' ? entry.heartbeatId : '',
            status,
            targetPath
        });
    } catch (error) {
        console.error('Failed to open heartbeat tray target', {
            heartbeatId: typeof entry.heartbeatId === 'string' ? entry.heartbeatId : '',
            status,
            targetPath,
            message: error?.message || String(error)
        });
    }
};

const handleMoveContextFolder = createMoveContextFolderHandler({
    loadSettings,
    saveSettings,
    validateContextFolderPath,
    moveFamiliarFolder,
    updateScreenCaptureFromSettings,
    notifyAlwaysRecordWhenActiveChanged,
    logger: console
});

if (process.platform === 'linux' && (isE2E || isCI)) {
    console.log('Applying Linux CI/E2E Electron flags');
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-dev-shm-usage');
}

const getSettingsWindowHtmlPath = () => {
    const reactHtmlPath = path.join(__dirname, 'dashboard', 'index-react.html');
    const reactBundlePath = path.join(__dirname, 'dashboard', 'react-dist', 'dashboard-react.js');

    if (!existsSync(reactHtmlPath) || !existsSync(reactBundlePath)) {
        console.error('React dashboard assets missing', {
            reactHtmlPath,
            reactBundlePath
        });
    }

    return reactHtmlPath;
};

function createSettingsWindow() {
    const dashboardHtmlPath = getSettingsWindowHtmlPath();
    const window = new BrowserWindow({
        // Keep the content area width stable while matching the sidebar width from the new design.
        width: 774,
        height: 578,
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

    window.loadFile(dashboardHtmlPath);

    window.on('close', (event) => {
        if (!isQuitting && !app.isQuittingForUpdate) {
            event.preventDefault();
            window.hide();
            enterBackgroundMode();
            console.log('Settings window hidden');
        }
    });

    window.on('closed', () => {
        settingsWindow = null;
    });

    console.log('Settings window created');
    return window;
}

function openSettingsWindow(options = {}) {
    if (!settingsWindow) {
        settingsWindow = createSettingsWindow();
    }

    enterForegroundMode();
    const result = showWindow(settingsWindow, options);
    const reason = options.reason || result.reason;
    if (result.shown) {
        console.log('Settings window shown', { focus: result.focused, reason });
        if (!settingsWindow.isDestroyed()) {
            settingsWindow.webContents.send('settings:window-opened', {
                at: Date.now(),
                reason
            });
        }
    } else {
        console.log('Settings window display skipped', { reason });
    }
}

function quitApp() {
    console.log('Quitting app');
    app.quit();
}

function createTray() {
    const resolveTrayHasUnreadHeartbeats = ({ settings = null } = {}) =>
        hasUnreadHeartbeatRuns({ settings, logger: console });
    const createTrayIcon = createTrayIconFactory({
        nativeImage,
        logger: console
    });
    const getTrayIconState = ({ settings = null } = {}) => {
        const hasUnreadHeartbeats = resolveTrayHasUnreadHeartbeats({ settings });
        return {
            hasUnreadHeartbeats,
            iconPath: getTrayIconPathForMenuBar({
                defaultIconPath: trayIconPath,
                hasUnreadHeartbeats,
                isDarkMode: nativeTheme.shouldUseDarkColors === true
            }),
            isTemplateImage: !hasUnreadHeartbeats && process.platform === 'darwin'
        };
    };
    resolveTrayIconStateForE2E = getTrayIconState;

    const getTrayIcon = ({ settings = null } = {}) => {
        const trayIconState = getTrayIconState({ settings });
        return createTrayIcon({
            defaultIconPath: trayIconPath,
            hasUnreadHeartbeats: trayIconState.hasUnreadHeartbeats,
            isDarkMode: nativeTheme.shouldUseDarkColors === true
        });
    };

    const updateTrayIcon = ({ settings = null } = {}) => {
        const trayIcon = getTrayIcon({ settings });
        if (trayIcon.isEmpty()) {
            console.error('Failed to resolve any tray icon image');
            return;
        }
        if (tray) {
            tray.setImage(trayIcon);
        }
    };
    refreshTrayIcon = updateTrayIcon;

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
        onOpenHeartbeat: (entry) => {
            void openHeartbeatFromTray(entry);
        },
        onOpenSettings: () => openSettingsWindow({ reason: 'tray' }),
        onQuit: quitApp,
    };

    trayMenuController = createTrayMenuController({
        tray,
        trayHandlers,
        getRecentHeartbeats: ({ settings }) => loadRecentHeartbeatRuns({ settings, logger: console }),
        getRecordingState: getCurrentScreenStillsState,
        onTrayMenuOpened: async ({ settings }) => {
            const markedSeenCount = markAllHeartbeatRunsSeen({ settings, logger: console });
            if (markedSeenCount > 0) {
                updateTrayIcon({ settings });
            }
        }
    });

    trayMenuController.refreshTrayMenuFromSettings();
    trayMenuController.registerTrayRefreshHandlers();
    updateTrayIcon();

    console.log('Tray created');
}

const registerMainProcessIpc = () => {
    registerIpcHandlers({
        onSettingsSaved: handleMainSettingsSaved,
        onMoveContextFolder: handleMoveContextFolder,
        runHeartbeatNow: (payload) => heartbeatScheduler?.runHeartbeatNow?.(payload)
    });

    ipcMain.on('microcopy:get-sync', (event) => {
        event.returnValue = microcopy;
    });

    ipcMain.on('environment:get-sync', (event) => {
        event.returnValue = {
            isDevelopmentMode: !app.isPackaged
        };
    });

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

    ipcMain.handle('e2e:tray:openMenu', async () => {
        if (!isE2E) {
            return { ok: false, message: 'Tray E2E action is only available in E2E mode.' };
        }
        if (!trayMenuController || typeof trayMenuController.handleTrayMenuOpen !== 'function') {
            return { ok: false, message: 'Tray menu controller is unavailable.' };
        }
        await trayMenuController.handleTrayMenuOpen();
        return {
            ok: true,
            iconState: resolveTrayIconStateForE2E()
        };
    });

    ipcMain.handle('e2e:tray:getIconState', () => {
        if (!isE2E) {
            return { ok: false, message: 'Tray E2E action is only available in E2E mode.' };
        }
        return {
            ok: true,
            iconState: resolveTrayIconStateForE2E()
        };
    });

    ipcMain.handle('e2e:tray:getMenuItems', () => {
        if (!isE2E) {
            return { ok: false, message: 'Tray E2E action is only available in E2E mode.' };
        }
        const items = getCurrentTrayMenuTemplate().map((item = {}) => ({
            label: typeof item.label === 'string' ? item.label : '',
            type: typeof item.type === 'string' ? item.type : 'normal',
            enabled: item.enabled !== false
        }));
        return { ok: true, items };
    });

    ipcMain.handle('e2e:tray:getHeartbeats', () => {
        if (!isE2E) {
            return { ok: false, message: 'Tray E2E action is only available in E2E mode.' };
        }
        return { ok: true, items: getCurrentTrayRecentHeartbeats() };
    });

    ipcMain.handle('e2e:tray:clickHeartbeat', async (_event, payload = {}) => {
        if (!isE2E) {
            return { ok: false, message: 'Tray E2E action is only available in E2E mode.' };
        }

        const rowId = Number(payload?.rowId);
        if (!Number.isFinite(rowId)) {
            return { ok: false, message: 'rowId is required.' };
        }

        const target = getCurrentTrayRecentHeartbeats().find((entry) => Number(entry?.id) === rowId);
        if (!target) {
            return { ok: false, message: 'Heartbeat tray item not found.' };
        }

        await openHeartbeatFromTray(target);
        return {
            ok: true,
            rowId,
            heartbeatId: typeof target.heartbeatId === 'string' ? target.heartbeatId : '',
            targetPath: typeof target.status === 'string' && target.status.toLowerCase() === 'failed'
                ? resolveFamiliarLogPath()
                : (typeof target.outputPath === 'string' ? target.outputPath : '')
        };
    });

    ipcMain.handle('e2e:textedit:events', (_event, options = {}) => {
        if (!isE2E) {
            return { ok: false, message: 'TextEdit E2E action is only available in E2E mode.' };
        }

        const clear = options?.clear === true;
        const events = [...e2eTextEditOpenEvents];
        if (clear) {
            e2eTextEditOpenEvents.length = 0;
        }

        return { ok: true, events };
    });
};

if (isPrimaryInstance) {
    registerMainProcessIpc();

    app.whenReady().then(async () => {
        if (process.platform !== 'darwin' && !isE2E) {
            console.error('Familiar desktop app is macOS-only right now.');
            app.quit();
            return;
        }

        await ensureFamiliarSkillAlignment();

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
                onRedactionWarning: handleRedactionWarning,
                onStateTransition: handleRecordingStateTransition,
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

        autoSessionCleanupScheduler = createAutoSessionCleanupScheduler({
            settingsLoader: loadSettings,
            settingsSaver: saveSettings,
            logger: console,
            checkIntervalMs: autoCleanupCheckIntervalMs
        });
        const initialRetentionDays = resolveCleanupRetentionDays({
            value: loadSettings()?.storageAutoCleanupRetentionDays
        });
        const resolveRetentionDays = (nextRetentionValue) =>
            resolveCleanupRetentionDays({ value: nextRetentionValue });
        retentionChangeTrigger = createRetentionChangeTrigger({
            resolveRetentionDays,
            initialRetentionDays,
            onRetentionChanged: () => {
                if (autoSessionCleanupScheduler && typeof autoSessionCleanupScheduler.tryRun === 'function') {
                    void autoSessionCleanupScheduler.tryRun('settings-change');
                }
            }
        });
        autoSessionCleanupScheduler.start();

        heartbeatScheduler = createHeartbeatScheduler({
            settingsLoader: loadSettings,
            settingsSaver: saveSettings,
            heartbeatHistoryStoreFactory: createHeartbeatHistoryStore,
            logger: console,
            isCaptureActive: isCaptureActiveForHeartbeats,
            onHeartbeatRunStateChanged: (payload) => {
                if (payload?.state === 'completed') {
                    refreshTrayMenu();
                    refreshTrayIcon();
                }
                notifyHeartbeatRunStateChanged(payload);
            },
            onFailure: (payload = {}) => {
                const title = 'Heartbeat failed'
                const topic = typeof payload.topic === 'string' && payload.topic.trim().length > 0
                    ? payload.topic
                    : 'Heartbeat'
                const message = buildHeartbeatFailureToastBody(topic)
                maybeE2EToast({
                    title,
                    body: message,
                    type: 'warning',
                    size: 'large',
                    duration: 10_000,
                    actions: [
                        {
                            label: 'Open logs',
                            action: 'open-familiar-log',
                            data: resolveFamiliarLogPath()
                        }
                    ]
                })
            }
        });
        heartbeatScheduler.start();

        let wasOpenedAtLogin = false;

        if (process.platform === 'darwin') {
            try {
                const loginItemSettings = app.getLoginItemSettings();
                wasOpenedAtLogin = loginItemSettings?.wasOpenedAtLogin === true;
            } catch (error) {
                console.warn('Failed to read login item settings', error);
            }
            enterBackgroundMode();
            app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

            createTray();
            const updateState = initializeAutoUpdater({ isE2E, isCI });
            if (updateState.enabled) {
                scheduleRecurringUpdateCheck();
            }
        } else if (isE2E) {
            console.log('E2E mode: running on non-macOS platform');
        }

        const shouldOpenSettings = shouldOpenSettingsOnReady({
            isE2E,
            platform: process.platform,
            wasOpenedAtLogin,
            hasOpenSettingsLaunchArg
        });

        if (shouldOpenSettings) {
            const reason = isE2E ? 'e2e' : hasOpenSettingsLaunchArg ? 'open-settings-arg' : 'launch';
            console.log('Opening settings window on launch', {
                reason,
                wasOpenedAtLogin,
                hasOpenSettingsLaunchArg
            });
            openSettingsWindow({ focus: isE2E ? false : true, reason });
        }

        app.on('activate', () => {
            openSettingsWindow({ reason: 'activate' });
        });
    });
}

app.on('before-quit', (event) => {
    autoSessionCleanupScheduler?.stop?.();
    heartbeatScheduler?.stop?.();
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
