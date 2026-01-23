const { app, BrowserWindow, Menu, Tray, dialog, nativeImage } = require('electron');
const path = require('node:path');

const { buildTrayMenuTemplate } = require('./menu');
const { registerIpcHandlers } = require('./ipc');
const { registerCaptureHandlers, startCaptureFlow, closeOverlayWindow } = require('./screenshot/capture');
const { registerCaptureHotkey, unregisterGlobalHotkeys } = require('./hotkeys');
const { registerExtractionHandlers } = require('./extraction');
const { registerAnalysisHandlers } = require('./analysis');
const { showWindow } = require('./utils/window');

const trayIconPath = path.join(__dirname, 'icon.png');

let tray = null;
let settingsWindow = null;
let isQuitting = false;

const isE2E = process.env.JIMINY_E2E === '1';
const isCI = process.env.CI === 'true' || process.env.CI === '1';

if (process.platform === 'linux' && (isE2E || isCI)) {
    console.log('Applying Linux CI/E2E Electron flags');
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-dev-shm-usage');
}

function createSettingsWindow() {
    const window = new BrowserWindow({
        width: 520,
        height: 440,
        resizable: false,
        fullscreenable: false,
        minimizable: false,
        show: false,
        title: 'Jiminy Settings',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    window.loadFile('index.html');

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

function createTray() {
    const trayIconBase = nativeImage.createFromPath(trayIconPath);
    if (trayIconBase.isEmpty()) {
        console.error(`Tray icon failed to load from ${trayIconPath}`);
    }

    const trayIcon = trayIconBase.resize({ width: 16, height: 16 });

    tray = new Tray(trayIcon);
    tray.setToolTip('Jiminy');

    const trayMenu = Menu.buildFromTemplate(
        buildTrayMenuTemplate({
            onCapture: () => {
                void startCaptureFlow();
            },
            onOpenSettings: showSettingsWindow,
            onAbout: showAboutDialog,
            onRestart: restartApp,
            onQuit: quitApp,
        })
    );

    tray.setContextMenu(trayMenu);

    console.log('Tray created');
}

// Register all IPC handlers
registerIpcHandlers();
registerCaptureHandlers();
registerExtractionHandlers();
registerAnalysisHandlers();

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
        const hotkeyResult = registerCaptureHotkey({
            onCapture: () => {
                void startCaptureFlow();
            },
        });
        if (!hotkeyResult.ok) {
            console.warn('Capture hotkey inactive', { reason: hotkeyResult.reason, accelerator: hotkeyResult.accelerator });
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

app.on('before-quit', () => {
    isQuitting = true;
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
        console.log("preventing app from exiting when all windows are closed");
        return;
    }

    if (!isE2E) {
        app.quit();
    }
});
