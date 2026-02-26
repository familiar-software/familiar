const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

const resetUpdatesModule = () => {
    const updatesPath = require.resolve('../src/updates');
    delete require.cache[updatesPath];
};

const stubModules = ({ isPackaged = true, dialogResponse = 1, loadSettingsValue = {} } = {}) => {
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
        BrowserWindow: {
            getAllWindows: () => [],
        },
    };

    const stubElectronUpdater = { autoUpdater };
    const stubElectronLog = { transports: { file: { level: null } } };
    const stubSettings = {
        loadSettings: () => loadSettingsValue,
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

test(
    'installDownloadedUpdate restarts only after an update is downloaded',
    { skip: process.platform !== 'darwin' },
    async () => {
        const { autoUpdater, calls, restore } = stubModules({ isPackaged: true, dialogResponse: 1 });
        resetUpdatesModule();
        const updates = require('../src/updates');

        updates.initializeAutoUpdater({ isE2E: false, isCI: false });

        const skipped = updates.installDownloadedUpdate({ reason: 'test' });
        assert.equal(skipped, false);
        assert.equal(calls.quitAndInstall, 0);

        autoUpdater.emit('update-downloaded', { version: '0.0.2' });
        await new Promise((resolve) => setTimeout(resolve, 0));

        const applied = updates.installDownloadedUpdate({ reason: 'test' });
        assert.equal(applied, true);
        assert.equal(calls.quitAndInstall, 1);

        restore();
        resetUpdatesModule();
    }
);

test(
    'scheduleWeeklyUpdateCheck schedules immediate startup delay when last check is older than a week',
    { skip: process.platform !== 'darwin' },
    () => {
        const now = 2_000_000_000_000;
        const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
        const timeoutCalls = [];
        const intervalCalls = [];

        const originalNow = Date.now;
        const originalSetTimeout = global.setTimeout;
        const originalSetInterval = global.setInterval;

        Date.now = () => now;
        global.setTimeout = (handler, delay) => {
            timeoutCalls.push(delay);
            if (typeof handler === 'function') {
                handler();
            }
            return 1;
        };
        global.setInterval = (handler, delay) => {
            intervalCalls.push(delay);
            return 2;
        };

        const { restore } = stubModules({
            isPackaged: true,
            loadSettingsValue: { updateLastCheckedAt: now - eightDaysMs },
        });
        try {
            resetUpdatesModule();
            const updates = require('../src/updates');
            updates.initializeAutoUpdater({ isE2E: false, isCI: false });

            const scheduled = updates.scheduleWeeklyUpdateCheck({ delayMs: 10_000 });
            assert.equal(scheduled.scheduled, true);
            assert.equal(scheduled.delayMs, 10_000);
            assert.deepEqual(timeoutCalls, [10_000]);
            assert.equal(intervalCalls.length, 1);
            assert.equal(intervalCalls[0], 7 * 24 * 60 * 60 * 1000);
        } finally {
            restore();
            resetUpdatesModule();
            Date.now = originalNow;
            global.setTimeout = originalSetTimeout;
            global.setInterval = originalSetInterval;
        }
    }
);

test(
    'scheduleWeeklyUpdateCheck delays until one-week gate when last check was recent',
    { skip: process.platform !== 'darwin' },
    () => {
        const now = 2_000_000_000_000;
        const oneDayMs = 24 * 60 * 60 * 1000;
        const expectedDelay = 6 * oneDayMs;
        const timeoutCalls = [];

        const originalNow = Date.now;
        const originalSetTimeout = global.setTimeout;
        const originalSetInterval = global.setInterval;

        Date.now = () => now;
        global.setTimeout = (handler, delay) => {
            timeoutCalls.push(delay);
            return 1;
        };
        global.setInterval = () => 2;

        const { restore } = stubModules({
            isPackaged: true,
            loadSettingsValue: { updateLastCheckedAt: now - oneDayMs },
        });
        try {
            resetUpdatesModule();
            const updates = require('../src/updates');
            updates.initializeAutoUpdater({ isE2E: false, isCI: false });

            const scheduled = updates.scheduleWeeklyUpdateCheck({ delayMs: 10_000 });
            assert.equal(scheduled.scheduled, true);
            assert.equal(scheduled.delayMs, expectedDelay);
            assert.deepEqual(timeoutCalls, [expectedDelay]);
        } finally {
            restore();
            resetUpdatesModule();
            Date.now = originalNow;
            global.setTimeout = originalSetTimeout;
            global.setInterval = originalSetInterval;
        }
    }
);
