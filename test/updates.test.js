const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

const resetUpdatesModule = () => {
    const updatesPath = require.resolve('../src/updates');
    delete require.cache[updatesPath];
};

const stubModules = ({ isPackaged = true, dialogResponse = 1 } = {}) => {
    const calls = {
        checkForUpdates: 0,
        downloadUpdate: 0,
        quitAndInstall: 0,
        showMessageBox: [],
        savedSettings: [],
    };

    const emitter = new EventEmitter();
    const autoUpdater = {
        autoDownload: null,
        autoInstallOnAppQuit: null,
        logger: null,
        on: emitter.on.bind(emitter),
        emit: emitter.emit.bind(emitter),
        checkForUpdates: async () => {
            calls.checkForUpdates += 1;
            return { updateInfo: { version: '0.0.2' } };
        },
        downloadUpdate: async () => {
            calls.downloadUpdate += 1;
            return true;
        },
        quitAndInstall: () => {
            calls.quitAndInstall += 1;
        },
    };

    const stubElectron = {
        app: { isPackaged, getVersion: () => '0.0.1' },
        dialog: {
            showMessageBox: async (options) => {
                calls.showMessageBox.push(options);
                return { response: dialogResponse };
            },
        },
    };

    const stubElectronUpdater = { autoUpdater };
    const stubElectronLog = { transports: { file: { level: null } } };
    const stubSettings = {
        loadSettings: () => ({}),
        saveSettings: (payload) => {
            calls.savedSettings.push(payload);
            return '/tmp/settings.json';
        },
    };

    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'electron') {
            return stubElectron;
        }
        if (request === 'electron-updater') {
            return stubElectronUpdater;
        }
        if (request === 'electron-log') {
            return stubElectronLog;
        }
        if (request === '../settings') {
            return stubSettings;
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    return {
        autoUpdater,
        calls,
        restore: () => {
            Module._load = originalLoad;
        },
    };
};

test('initializeAutoUpdater disables when running E2E', () => {
    const { restore } = stubModules({ isPackaged: true });
    resetUpdatesModule();
    const updates = require('../src/updates');

    const result = updates.initializeAutoUpdater({ isE2E: true, isCI: false });
    assert.equal(result.enabled, false);

    restore();
    resetUpdatesModule();
});

test('checkForUpdates returns disabled when auto-updates are off', async () => {
    const { restore } = stubModules({ isPackaged: false });
    resetUpdatesModule();
    const updates = require('../src/updates');

    updates.initializeAutoUpdater({ isE2E: false, isCI: false });
    const result = await updates.checkForUpdates({ reason: 'manual' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'disabled');

    restore();
    resetUpdatesModule();
});

test(
    'checkForUpdates calls autoUpdater and prompts for restart on download',
    { skip: process.platform !== 'darwin' },
    async () => {
        const { autoUpdater, calls, restore } = stubModules({ isPackaged: true, dialogResponse: 0 });
        resetUpdatesModule();
        const updates = require('../src/updates');

        const init = updates.initializeAutoUpdater({ isE2E: false, isCI: false });
        assert.equal(init.enabled, true);

        const result = await updates.checkForUpdates({ reason: 'manual' });
        assert.equal(result.ok, true);
        assert.equal(calls.checkForUpdates, 1);

        autoUpdater.emit('update-downloaded', { version: '0.0.2' });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(calls.showMessageBox.length, 1);
        assert.equal(calls.quitAndInstall, 1);

        restore();
        resetUpdatesModule();
    }
);

test(
    'update-available prompts for download and triggers download when accepted',
    { skip: process.platform !== 'darwin' },
    async () => {
        const { autoUpdater, calls, restore } = stubModules({ isPackaged: true, dialogResponse: 0 });
        resetUpdatesModule();
        const updates = require('../src/updates');

        updates.initializeAutoUpdater({ isE2E: false, isCI: false });

        autoUpdater.emit('update-available', { version: '0.0.2' });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(calls.showMessageBox.length, 1);
        assert.equal(calls.downloadUpdate, 1);

        restore();
        resetUpdatesModule();
    }
);
