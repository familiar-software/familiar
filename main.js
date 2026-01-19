// Modules to control application life and create native browser window
const { app, BrowserWindow, Menu, Tray, dialog, nativeImage, ipcMain } = require('electron');
const path = require('node:path');
const { buildTrayMenuTemplate } = require('./menu');
const { loadSettings, saveSettings, validateContextFolderPath } = require('./settings');
const { JsonContextGraphStore, createSummarizer, DEFAULT_MODEL, syncContextGraph } = require('./context-graph');
const trayIconPath = path.join(__dirname, 'icon.png');

let tray = null;
let settingsWindow = null;
let isQuitting = false;

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

function showSettingsWindow() {
    if (!settingsWindow) {
        settingsWindow = createSettingsWindow();
    }

    if (settingsWindow.isMinimized()) {
        settingsWindow.restore();
    }

    settingsWindow.show();
    settingsWindow.focus();
    console.log('Settings window shown');
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
            onOpenSettings: showSettingsWindow,
            onAbout: showAboutDialog,
            onRestart: restartApp,
            onQuit: quitApp,
        })
    );

    tray.setContextMenu(trayMenu);

    console.log('Tray created');
}

ipcMain.handle('settings:get', () => {
    try {
        const settings = loadSettings();
        const contextFolderPath = settings.contextFolderPath || '';
        const llmProviderApiKey = settings?.llm_provider?.api_key || '';
        const exclusions = Array.isArray(settings.exclusions) ? settings.exclusions : [];
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

        return { contextFolderPath, validationMessage, llmProviderApiKey, exclusions };
    } catch (error) {
        console.error('Failed to load settings', error);
        return { contextFolderPath: '', validationMessage: 'Failed to load settings.', llmProviderApiKey: '', exclusions: [] };
    }
});

ipcMain.handle('settings:pickContextFolder', async (event) => {
    if (process.env.JIMINY_E2E === '1' && process.env.JIMINY_E2E_CONTEXT_PATH) {
        const testPath = process.env.JIMINY_E2E_CONTEXT_PATH;
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
});

ipcMain.handle('settings:pickExclusion', async (event, contextFolderPath) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const defaultPath = contextFolderPath || undefined;

    const openDialogOptions = {
        title: 'Select File or Folder to Exclude',
        defaultPath,
        properties: ['openFile', 'openDirectory'],
    };

    console.log('Opening exclusion picker', { defaultPath });
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
        console.error('Failed to open exclusion picker', error);
        return { canceled: true, error: 'Failed to open picker.' };
    }

    if (result.canceled || result.filePaths.length === 0) {
        console.log('Exclusion picker canceled');
        return { canceled: true };
    }

    const selectedPath = result.filePaths[0];

    // Validate the selected path is inside the context folder
    if (contextFolderPath) {
        const resolvedContext = path.resolve(contextFolderPath);
        const resolvedSelected = path.resolve(selectedPath);
        if (!resolvedSelected.startsWith(resolvedContext + path.sep) && resolvedSelected !== resolvedContext) {
            console.warn('Selected exclusion is outside context folder', { selectedPath, contextFolderPath });
            return { canceled: true, error: 'Selected path must be inside the context folder.' };
        }

        // Return relative path from context folder
        const relativePath = path.relative(resolvedContext, resolvedSelected);
        console.log('Exclusion selected', { absolutePath: selectedPath, relativePath });
        return { canceled: false, path: relativePath };
    }

    console.log('Exclusion selected (no context folder)', { path: selectedPath });
    return { canceled: false, path: selectedPath };
});

ipcMain.handle('settings:save', (event, payload) => {
    const hasContextFolderPath = Object.prototype.hasOwnProperty.call(payload || {}, 'contextFolderPath');
    const hasLlmProviderApiKey = Object.prototype.hasOwnProperty.call(payload || {}, 'llmProviderApiKey');
    const hasExclusions = Object.prototype.hasOwnProperty.call(payload || {}, 'exclusions');
    const settingsPayload = {};

    if (!hasContextFolderPath && !hasLlmProviderApiKey && !hasExclusions) {
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

    if (hasExclusions) {
        settingsPayload.exclusions = Array.isArray(payload.exclusions) ? payload.exclusions : [];
    }

    try {
        saveSettings(settingsPayload);
        console.log('Settings saved');
        return { ok: true };
    } catch (error) {
        console.error('Failed to save settings', error);
        return { ok: false, message: 'Failed to save settings.' };
    }
});

ipcMain.handle('contextGraph:sync', async (event) => {
    const settings = loadSettings();
    const contextFolderPath = settings.contextFolderPath || '';
    const llmProviderApiKey = settings?.llm_provider?.api_key || '';
    const exclusions = Array.isArray(settings.exclusions) ? settings.exclusions : [];
    const validation = validateContextFolderPath(contextFolderPath);

    if (!validation.ok) {
        console.warn('Context graph sync failed validation', { message: validation.message });
        return { ok: false, message: validation.message };
    }

    try {
        if (process.env.JIMINY_LLM_MOCK !== '1' && !llmProviderApiKey) {
            return { ok: false, message: 'LLM API key is not configured. Set it in Settings.' };
        }

        const store = new JsonContextGraphStore();
        const summarizer = createSummarizer({ model: DEFAULT_MODEL, apiKey: llmProviderApiKey });
        const result = await syncContextGraph({
            rootPath: validation.path,
            store,
            summarizer,
            exclusions,
            onProgress: (progress) => {
                event.sender.send('contextGraph:progress', progress);
            },
        });

        return {
            ok: true,
            graphPath: store.getPath(),
            counts: result.graph.counts,
            errors: result.errors,
            warnings: result.warnings,
        };
    } catch (error) {
        console.error('Context graph sync failed', error);
        return { ok: false, message: error.message || 'Failed to sync context graph.' };
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    if (process.platform !== 'darwin') {
        console.error('Jiminy desktop app is macOS-only right now.');
        app.quit();
        return;
    }

    app.dock.hide();
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

    createTray();

    if (process.env.JIMINY_E2E === '1') {
        console.log('E2E mode: opening settings window');
        showSettingsWindow();
    }

    app.on('activate', () => {
        // Keep background-only behavior; open Settings only from the tray menu.
    });
});

app.on('before-quit', () => {
    isQuitting = true;
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
