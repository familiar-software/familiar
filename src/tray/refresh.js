const { buildTrayMenuTemplate } = require('../menu');
const { loadSettings } = require('../settings');
const { getRecordingIndicatorVisuals } = require('../recording-status-indicator');
const { microcopy } = require('../microcopy');
const { createCircleIconFactory } = require('./circle-icon');

const getElectronMenu = () => {
    const electron = require('electron');
    return electron && electron.Menu ? electron.Menu : null;
};

function createRecordingIndicatorIconFactory({
    logger = console,
} = {}) {
    return createCircleIconFactory({
        logger,
        size: 12,
        circleRadius: 4
    });
}

function createTrayMenuController({
    tray,
    trayHandlers,
    loadSettingsFn = loadSettings,
    buildTrayMenuTemplateFn = buildTrayMenuTemplate,
    getRecordingState = null,
    onTrayMenuOpened = null,
    menu = getElectronMenu(),
    recordingIndicatorIconFactory = null,
    logger = console,
} = {}) {
    const resolveRecordingIndicatorIcon = typeof recordingIndicatorIconFactory === 'function'
        ? recordingIndicatorIconFactory
        : createRecordingIndicatorIconFactory({ logger });

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

    function getTrayMenuTemplate({ recordingPaused, settings = null } = {}) {
        if (!trayHandlers) {
            logger.warn('Tray menu template build skipped: handlers not ready');
            return [];
        }

        const isPaused =
            typeof recordingPaused === 'boolean' ? recordingPaused : resolveRecordingPaused();
        const recordingState = resolveRecordingState();
        const recordingIndicator = getRecordingIndicatorVisuals(recordingState || {});
        const recordingStatusIcon = resolveRecordingIndicatorIcon({
            colorHex: recordingIndicator.trayColorHex
        });
        return buildTrayMenuTemplateFn({
            ...trayHandlers,
            recordingPaused: isPaused,
            recordingState,
            recordingStatusIcon
        });
    }

    function updateTrayMenu({ recordingPaused, settings = null } = {}) {
        if (!menu) {
            logger.warn('Tray menu update skipped: menu unavailable');
            return;
        }
        if (!tray) {
            logger.warn('Tray menu update skipped: tray not ready');
            return;
        }

        const trayMenu = menu.buildFromTemplate(
            getTrayMenuTemplate({ recordingPaused, settings })
        );
        const resolvedRecordingPaused =
            typeof recordingPaused === 'boolean' ? recordingPaused : resolveRecordingPaused();
        const recordingState = resolveRecordingState();
        const recordingIndicator = getRecordingIndicatorVisuals(recordingState || {});

        tray.setContextMenu(trayMenu);
        if (typeof tray.setToolTip === 'function') {
            tray.setToolTip(microcopy.app.name);
        }

        logger.log('Tray menu updated', {
            recordingPaused: resolvedRecordingPaused,
            recordingIndicatorStatus: recordingIndicator.status
        });
    }

    function refreshTrayMenuFromSettings() {
        const settings = loadSettingsFn();
        updateTrayMenu({
            settings,
            recordingPaused: resolveRecordingPaused(),
        });
    }

    async function handleTrayMenuOpen() {
        const settings = loadSettingsFn();
        updateTrayMenu({
            settings,
            recordingPaused: resolveRecordingPaused(),
        });

        if (typeof onTrayMenuOpened === 'function') {
            try {
                await onTrayMenuOpened({ settings });
            } catch (error) {
                logger.warn('Tray menu open side effects failed', {
                    message: error?.message || String(error)
                });
            }
        }
    }

    function registerTrayRefreshHandlers() {
        if (tray && typeof tray.on === 'function') {
            tray.on('click', () => {
                void handleTrayMenuOpen();
            });

            tray.on('right-click', () => {
                void handleTrayMenuOpen();
            });
        } else {
            logger.warn('Tray menu refresh handlers unavailable');
        }
    }

    return {
        handleTrayMenuOpen,
        getTrayMenuTemplate,
        updateTrayMenu,
        refreshTrayMenuFromSettings,
        registerTrayRefreshHandlers,
    };
}

module.exports = {
    createTrayMenuController,
    createRecordingIndicatorIconFactory,
};
