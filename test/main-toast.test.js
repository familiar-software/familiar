const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const resetMainModule = () => {
    const mainPath = require.resolve('../src/main');
    delete require.cache[mainPath];
};

test('hotkey re-registration triggers toast warnings on failure', async () => {
    const toastCalls = [];
    const handlers = {};

    const stubElectron = {
        app: {
            quit: () => {},
            relaunch: () => {},
            exit: () => {},
            whenReady: () => ({
                then: (cb) => {
                    cb();
                    return { catch: () => {} };
                },
            }),
            on: () => {},
            disableHardwareAcceleration: () => {},
            commandLine: { appendSwitch: () => {} },
            setLoginItemSettings: () => {},
        },
        BrowserWindow: function () {},
        Menu: { buildFromTemplate: () => [] },
        Tray: function () {
            this.setToolTip = () => {};
            this.setContextMenu = () => {};
        },
        dialog: { showMessageBox: () => {} },
        nativeImage: {
            createFromPath: () => ({
                isEmpty: () => false,
                resize: () => ({}),
            }),
        },
        ipcMain: {
            handle: (channel, handler) => {
                handlers[channel] = handler;
            },
        },
    };

    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'electron') {
            return stubElectron;
        }
        if (request === './logger') {
            return { initLogging: () => {} };
        }
        if (request === './toast') {
            return {
                showToast: (payload) => {
                    toastCalls.push(payload);
                },
            };
        }
        if (request === './hotkeys') {
            return {
                DEFAULT_RECORDING_HOTKEY: 'Cmd+Shift+R',
                registerRecordingHotkey: () => ({
                    ok: false,
                    reason: 'registration-failed',
                    accelerator: 'Cmd+Shift+R',
                }),
                unregisterGlobalHotkeys: () => {},
            };
        }
        if (request === './settings') {
            return { loadSettings: () => ({}) };
        }
        if (
            request === './menu' ||
            request === './ipc' ||
            request === './clipboard' ||
            request === './utils/window' ||
            request === './tray/refresh'
        ) {
            return {
                buildTrayMenuTemplate: () => [],
                registerIpcHandlers: () => {},
                captureClipboard: async () => ({}),
                showWindow: () => ({ shown: false, reason: 'test', focused: false }),
                resolveHotkeyAccelerators: () => ({ recordingAccelerator: null }),
                createTrayMenuController: () => ({
                    refreshTrayMenuFromSettings: () => {},
                    registerTrayRefreshHandlers: () => {},
                    updateTrayMenu: () => {}
                })
            };
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    resetMainModule();

    try {
        require('../src/main');
        assert.equal(typeof handlers['hotkeys:reregister'], 'function');
        toastCalls.length = 0;
        await handlers['hotkeys:reregister']();

        assert.equal(toastCalls.length, 1);
        assert.equal(toastCalls[0].title, 'Screen stills hotkey inactive');
    } finally {
        Module._load = originalLoad;
        resetMainModule();
    }
});
