const { buildTrayMenuTemplate } = require('../menu');
const { getRecentFlows } = require('../history');
const { loadSettings } = require('../settings');

const getElectronMenu = () => {
    const electron = require('electron');
    return electron && electron.Menu ? electron.Menu : null;
};

function resolveHotkeyAccelerators(
    settings = {},
    { DEFAULT_CAPTURE_HOTKEY, DEFAULT_CLIPBOARD_HOTKEY, DEFAULT_RECORDING_HOTKEY } = {}
) {
    const captureAccelerator =
        typeof settings.captureHotkey === 'string' && settings.captureHotkey
            ? settings.captureHotkey
            : DEFAULT_CAPTURE_HOTKEY;
    const clipboardAccelerator =
        typeof settings.clipboardHotkey === 'string' && settings.clipboardHotkey
            ? settings.clipboardHotkey
            : DEFAULT_CLIPBOARD_HOTKEY;
    const recordingAccelerator =
        typeof settings.recordingHotkey === 'string' && settings.recordingHotkey
            ? settings.recordingHotkey
            : DEFAULT_RECORDING_HOTKEY;

    return { captureAccelerator, clipboardAccelerator, recordingAccelerator };
}

function resolveHistoryItems(settings = {}, { getRecentFlowsFn = getRecentFlows } = {}) {
    const contextFolderPath =
        typeof settings.contextFolderPath === 'string' ? settings.contextFolderPath : '';
    if (!contextFolderPath) {
        return [];
    }

    return getRecentFlowsFn({ contextFolderPath, limit: 3 });
}

function buildTrayMenuPayload(
    settings = {},
    {
        DEFAULT_CAPTURE_HOTKEY,
        DEFAULT_CLIPBOARD_HOTKEY,
        DEFAULT_RECORDING_HOTKEY,
        getRecentFlowsFn = getRecentFlows,
    } = {}
) {
    const { captureAccelerator, clipboardAccelerator, recordingAccelerator } = resolveHotkeyAccelerators(settings, {
        DEFAULT_CAPTURE_HOTKEY,
        DEFAULT_CLIPBOARD_HOTKEY,
        DEFAULT_RECORDING_HOTKEY
    });
    return {
        captureAccelerator,
        clipboardAccelerator,
        recordingAccelerator,
        historyItems: resolveHistoryItems(settings, { getRecentFlowsFn }),
    };
}

function createTrayMenuController({
    tray,
    trayHandlers,
    DEFAULT_CAPTURE_HOTKEY,
    DEFAULT_CLIPBOARD_HOTKEY,
    DEFAULT_RECORDING_HOTKEY,
    loadSettingsFn = loadSettings,
    getRecentFlowsFn = getRecentFlows,
    buildTrayMenuTemplateFn = buildTrayMenuTemplate,
    menu = getElectronMenu(),
    platform = process.platform,
    logger = console,
} = {}) {
    function updateTrayMenu({ captureAccelerator, clipboardAccelerator, historyItems } = {}) {
        if (!menu) {
            logger.warn('Tray menu update skipped: menu unavailable');
            return;
        }
        if (!tray) {
            logger.warn('Tray menu update skipped: tray not ready');
            return;
        }

        if (!trayHandlers) {
            logger.warn('Tray menu update skipped: handlers not ready');
            return;
        }

        const resolvedHistoryItems = Array.isArray(historyItems)
            ? historyItems
            : resolveHistoryItems(loadSettingsFn(), { getRecentFlowsFn });
        const showHotkeys = platform === 'darwin';
        const trayMenu = menu.buildFromTemplate(
            buildTrayMenuTemplateFn({
                ...trayHandlers,
                captureAccelerator: showHotkeys ? captureAccelerator : undefined,
                clipboardAccelerator: showHotkeys ? clipboardAccelerator : undefined,
                historyItems: resolvedHistoryItems,
            })
        );

        tray.setContextMenu(trayMenu);
        logger.log('Tray menu updated', {
            captureAccelerator: Boolean(showHotkeys && captureAccelerator),
            clipboardAccelerator: Boolean(showHotkeys && clipboardAccelerator),
        });
    }

    function refreshTrayMenuFromSettings() {
        const settings = loadSettingsFn();
        updateTrayMenu(
            buildTrayMenuPayload(settings, {
                DEFAULT_CAPTURE_HOTKEY,
                DEFAULT_CLIPBOARD_HOTKEY,
                DEFAULT_RECORDING_HOTKEY,
                getRecentFlowsFn,
            })
        );
    }

    function registerTrayRefreshHandlers() {
        if (tray && typeof tray.on === 'function') {
            tray.on('click', () => {
                refreshTrayMenuFromSettings();
            });

            tray.on('right-click', () => {
                refreshTrayMenuFromSettings();
            });
        } else {
            logger.warn('Tray menu refresh handlers unavailable');
        }
    }

    return {
        updateTrayMenu,
        refreshTrayMenuFromSettings,
        registerTrayRefreshHandlers,
    };
}

module.exports = {
    resolveHotkeyAccelerators,
    resolveHistoryItems,
    buildTrayMenuPayload,
    createTrayMenuController,
};
