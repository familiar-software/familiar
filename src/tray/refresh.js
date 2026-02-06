const { buildTrayMenuTemplate } = require('../menu');
const { loadSettings } = require('../settings');

const getElectronMenu = () => {
    const electron = require('electron');
    return electron && electron.Menu ? electron.Menu : null;
};

function resolveHotkeyAccelerators(
    settings = {},
    { DEFAULT_CLIPBOARD_HOTKEY, DEFAULT_RECORDING_HOTKEY } = {}
) {
    const clipboardAccelerator =
        typeof settings.clipboardHotkey === 'string' && settings.clipboardHotkey
            ? settings.clipboardHotkey
            : DEFAULT_CLIPBOARD_HOTKEY;
    const recordingAccelerator =
        typeof settings.recordingHotkey === 'string' && settings.recordingHotkey
            ? settings.recordingHotkey
            : DEFAULT_RECORDING_HOTKEY;

    return { clipboardAccelerator, recordingAccelerator };
}

function buildTrayMenuPayload(
    settings = {},
    {
        DEFAULT_CLIPBOARD_HOTKEY,
        DEFAULT_RECORDING_HOTKEY,
    } = {}
) {
    const { clipboardAccelerator, recordingAccelerator } = resolveHotkeyAccelerators(settings, {
        DEFAULT_CLIPBOARD_HOTKEY,
        DEFAULT_RECORDING_HOTKEY
    });
    return {
        clipboardAccelerator,
        recordingAccelerator,
    };
}

function createTrayMenuController({
    tray,
    trayHandlers,
    DEFAULT_CLIPBOARD_HOTKEY,
    DEFAULT_RECORDING_HOTKEY,
    loadSettingsFn = loadSettings,
    buildTrayMenuTemplateFn = buildTrayMenuTemplate,
    getRecordingState = null,
    menu = getElectronMenu(),
    platform = process.platform,
    logger = console,
} = {}) {
    const resolveRecordingPaused = () => {
        if (typeof getRecordingState !== 'function') {
            return false;
        }
        const state = getRecordingState();
        return Boolean(state && state.manualPaused);
    };

    function updateTrayMenu({ clipboardAccelerator, recordingAccelerator, recordingPaused } = {}) {
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
        const showHotkeys = platform === 'darwin';
        const isPaused =
            typeof recordingPaused === 'boolean' ? recordingPaused : resolveRecordingPaused();
        const trayMenu = menu.buildFromTemplate(
            buildTrayMenuTemplateFn({
                ...trayHandlers,
                clipboardAccelerator: showHotkeys ? clipboardAccelerator : undefined,
                recordingAccelerator: showHotkeys ? recordingAccelerator : undefined,
                recordingPaused: isPaused,
            })
        );

        tray.setContextMenu(trayMenu);
        logger.log('Tray menu updated', {
            clipboardAccelerator: Boolean(showHotkeys && clipboardAccelerator),
            recordingAccelerator: Boolean(showHotkeys && recordingAccelerator),
            recordingPaused: isPaused,
        });
    }

    function refreshTrayMenuFromSettings() {
        const settings = loadSettingsFn();
        updateTrayMenu({
            ...buildTrayMenuPayload(settings, {
                DEFAULT_CLIPBOARD_HOTKEY,
                DEFAULT_RECORDING_HOTKEY,
            }),
            recordingPaused: resolveRecordingPaused(),
        });
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
    buildTrayMenuPayload,
    createTrayMenuController,
};
