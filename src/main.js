const { app, BrowserWindow, Menu, Tray, dialog, nativeImage, ipcMain } = require('electron');
const path = require('node:path');

const { buildTrayMenuTemplate } = require('./menu');
const { registerIpcHandlers } = require('./ipc');
const { registerCaptureHandlers, startCaptureFlow, closeOverlayWindow } = require('./screenshot/capture');
const { captureClipboard } = require('./clipboard');
const {
    registerCaptureHotkey,
    registerClipboardHotkey,
    unregisterGlobalHotkeys,
    DEFAULT_CAPTURE_HOTKEY,
    DEFAULT_CLIPBOARD_HOTKEY,
} = require('./hotkeys');
const { registerExtractionHandlers } = require('./extraction');
const { registerAnalysisHandlers } = require('./analysis');
const { getRecentFlows } = require('./history');
const { showWindow } = require('./utils/window');
const { loadSettings } = require('./settings');
const { initLogging } = require('./logger');
const { showToast } = require('./toast');
const { registerTrayBusyIndicator } = require('./tray/busy');

const trayIconPath = path.join(__dirname, 'icon.png');

let tray = null;
let trayHandlers = null;
let trayBusyIndicator = null;
let settingsWindow = null;
let isQuitting = false;

const isE2E = process.env.JIMINY_E2E === '1';
const isCI = process.env.CI === 'true' || process.env.CI === '1';

initLogging();

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
    dialog.showMessageBox({
        type: 'info',
        title: 'About Jiminy',
        message: 'Jiminy',
        detail: 'Menu bar app shell (macOS).',
        buttons: ['OK'],
    });
}

function restartApp() {
    console.log('Restarting app');
    app.relaunch();
    app.exit(0);
}

function quitApp() {
    console.log('Quitting app');
    app.quit();
}

function resolveHotkeyAccelerators(settings = {}) {
    const captureAccelerator =
        typeof settings.captureHotkey === 'string' && settings.captureHotkey
            ? settings.captureHotkey
            : DEFAULT_CAPTURE_HOTKEY;
    const clipboardAccelerator =
        typeof settings.clipboardHotkey === 'string' && settings.clipboardHotkey
            ? settings.clipboardHotkey
            : DEFAULT_CLIPBOARD_HOTKEY;

    return { captureAccelerator, clipboardAccelerator };
}

function resolveHistoryItems(settings = {}) {
    const contextFolderPath =
        typeof settings.contextFolderPath === 'string' ? settings.contextFolderPath : '';
    if (!contextFolderPath) {
        return [];
    }

    return getRecentFlows({ contextFolderPath, limit: 3 });
}

function buildTrayMenuPayload(settings = {}) {
    const { captureAccelerator, clipboardAccelerator } = resolveHotkeyAccelerators(settings);
    return {
        captureAccelerator,
        clipboardAccelerator,
        historyItems: resolveHistoryItems(settings),
    };
}

function updateTrayMenu({ captureAccelerator, clipboardAccelerator, historyItems } = {}) {
    if (!tray) {
        console.warn('Tray menu update skipped: tray not ready');
        return;
    }

    if (!trayHandlers) {
        console.warn('Tray menu update skipped: handlers not ready');
        return;
    }

    const resolvedHistoryItems = Array.isArray(historyItems)
        ? historyItems
        : resolveHistoryItems(loadSettings());
    const showHotkeys = process.platform === 'darwin';
    const trayMenu = Menu.buildFromTemplate(
        buildTrayMenuTemplate({
            ...trayHandlers,
            captureAccelerator: showHotkeys ? captureAccelerator : undefined,
            clipboardAccelerator: showHotkeys ? clipboardAccelerator : undefined,
            historyItems: resolvedHistoryItems,
        })
    );

    tray.setContextMenu(trayMenu);
    console.log('Tray menu updated', {
        captureAccelerator: Boolean(showHotkeys && captureAccelerator),
        clipboardAccelerator: Boolean(showHotkeys && clipboardAccelerator),
    });
}

function refreshTrayMenuFromSettings() {
    const settings = loadSettings();
    updateTrayMenu(buildTrayMenuPayload(settings));
}

function registerHotkeysFromSettings() {
    const settings = loadSettings();
    const { captureAccelerator, clipboardAccelerator } = resolveHotkeyAccelerators(settings);

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

    return { captureResult, clipboardResult, captureAccelerator, clipboardAccelerator };
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

    refreshTrayMenuFromSettings();

    if (tray && typeof tray.on === 'function') {
        tray.on('click', () => {
            refreshTrayMenuFromSettings();
        });

        tray.on('right-click', () => {
            refreshTrayMenuFromSettings();
        });
    } else {
        console.warn('Tray menu refresh handlers unavailable');
    }

    console.log('Tray created');
}

// Register all IPC handlers
registerIpcHandlers();
registerCaptureHandlers();
registerExtractionHandlers();
registerAnalysisHandlers();

// IPC handler for hotkey re-registration
ipcMain.handle('hotkeys:reregister', () => {
    console.log('Re-registering hotkeys from settings');
    const result = registerHotkeysFromSettings();
    updateTrayMenu({
        captureAccelerator: result.captureAccelerator,
        clipboardAccelerator: result.clipboardAccelerator,
    });
    return {
        ok: result.captureResult.ok && result.clipboardResult.ok,
        captureHotkey: result.captureResult,
        clipboardHotkey: result.clipboardResult,
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
    updateTrayMenu({
        captureAccelerator: result.captureAccelerator,
        clipboardAccelerator: result.clipboardAccelerator,
    });
    return {
        ok: result.captureResult.ok && result.clipboardResult.ok,
        captureHotkey: result.captureResult,
        clipboardHotkey: result.clipboardResult,
    };
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

app.on('before-quit', () => {
    isQuitting = true;
    if (trayBusyIndicator) {
        trayBusyIndicator.dispose();
    }
    unregisterGlobalHotkeys();
    closeOverlayWindow();
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in main process', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection in main process', reason);
});

app.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone', details);
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
