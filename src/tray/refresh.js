const { buildTrayMenuTemplate } = require('../menu');
const { loadSettings } = require('../settings');

const getElectronMenu = () => {
    const electron = require('electron');
    return electron && electron.Menu ? electron.Menu : null;
};

function resolveHotkeyAccelerators(
    settings = {},
    { DEFAULT_RECORDING_HOTKEY } = {}
) {
    const recordingAccelerator =
        typeof settings.recordingHotkey === 'string' && settings.recordingHotkey
            ? settings.recordingHotkey
            : DEFAULT_RECORDING_HOTKEY;

    return { recordingAccelerator };
}

function buildTrayMenuPayload(
    settings = {},
    {
        DEFAULT_RECORDING_HOTKEY,
    } = {}
) {
    const { recordingAccelerator } = resolveHotkeyAccelerators(settings, {
        DEFAULT_RECORDING_HOTKEY
    });
    return {
        recordingAccelerator,
    };
}

function createTrayMenuController({
    tray,
    trayHandlers,
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

    const resolveRecordingState = () => {
        if (typeof getRecordingState !== 'function') {
            return null;
        }
        return getRecordingState() || null;
    };

    function updateTrayMenu({ recordingAccelerator, recordingPaused } = {}) {
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
        const recordingState = resolveRecordingState();
        const trayMenu = menu.buildFromTemplate(
            buildTrayMenuTemplateFn({
                ...trayHandlers,
                recordingAccelerator: showHotkeys ? recordingAccelerator : undefined,
                recordingPaused: isPaused,
                recordingState
            })
        );

        tray.setContextMenu(trayMenu);
        logger.log('Tray menu updated', {
            recordingAccelerator: Boolean(showHotkeys && recordingAccelerator),
            recordingPaused: isPaused,
        });
    }

    function refreshTrayMenuFromSettings() {
        const settings = loadSettingsFn();
        updateTrayMenu({
            ...buildTrayMenuPayload(settings, {
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
