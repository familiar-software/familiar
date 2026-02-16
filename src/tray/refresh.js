const { buildTrayMenuTemplate } = require('../menu');
const { loadSettings } = require('../settings');
const { getRecordingIndicatorVisuals } = require('../recording-status-indicator');

const getElectronMenu = () => {
    const electron = require('electron');
    return electron && electron.Menu ? electron.Menu : null;
};

const getElectronNativeImage = () => {
    const electron = require('electron');
    return electron && electron.nativeImage ? electron.nativeImage : null;
};

const encodeSvgDataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

function createRecordingIndicatorIconFactory({
    nativeImage = getElectronNativeImage(),
    logger = console,
} = {}) {
    const cache = new Map();

    return ({ colorHex } = {}) => {
        if (!nativeImage || typeof nativeImage.createFromDataURL !== 'function') {
            return null;
        }
        if (typeof colorHex !== 'string' || colorHex.length === 0) {
            return null;
        }
        if (cache.has(colorHex)) {
            return cache.get(colorHex);
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="4" fill="${colorHex}"/></svg>`;
        const icon = nativeImage.createFromDataURL(encodeSvgDataUrl(svg));
        if (!icon || (typeof icon.isEmpty === 'function' && icon.isEmpty())) {
            logger.warn('Tray recording indicator icon creation failed', { colorHex });
            return null;
        }

        const sizedIcon = typeof icon.resize === 'function'
            ? icon.resize({ width: 12, height: 12 })
            : icon;
        cache.set(colorHex, sizedIcon);
        return sizedIcon;
    };
}

function createTrayMenuController({
    tray,
    trayHandlers,
    loadSettingsFn = loadSettings,
    buildTrayMenuTemplateFn = buildTrayMenuTemplate,
    getRecordingState = null,
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

    function updateTrayMenu({ recordingPaused } = {}) {
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

        const isPaused =
            typeof recordingPaused === 'boolean' ? recordingPaused : resolveRecordingPaused();
        const recordingState = resolveRecordingState();
        const recordingIndicator = getRecordingIndicatorVisuals(recordingState || {});
        const recordingStatusIcon = resolveRecordingIndicatorIcon({
            colorHex: recordingIndicator.trayColorHex
        });
        const trayMenu = menu.buildFromTemplate(
            buildTrayMenuTemplateFn({
                ...trayHandlers,
                recordingPaused: isPaused,
                recordingState,
                recordingStatusIcon
            })
        );

        tray.setContextMenu(trayMenu);
        if (typeof tray.setToolTip === 'function') {
            tray.setToolTip('Familiar');
        }

        logger.log('Tray menu updated', {
            recordingPaused: isPaused,
            recordingIndicatorStatus: recordingIndicator.status
        });
    }

    function refreshTrayMenuFromSettings() {
        loadSettingsFn();
        updateTrayMenu({
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
    createTrayMenuController,
    createRecordingIndicatorIconFactory,
};
