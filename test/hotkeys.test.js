const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const resetHotkeysModule = () => {
    const hotkeysPath = require.resolve('../src/hotkeys');
    delete require.cache[hotkeysPath];
};

const stubElectron = () => {
    const registrations = [];

    const stub = {
        globalShortcut: {
            register: (accelerator, callback) => {
                registrations.push({ type: 'register', accelerator, callback });
                return true;
            },
            unregister: (accelerator) => {
                registrations.push({ type: 'unregister', accelerator });
            },
        },
    };

    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'electron') {
            return stub;
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    return {
        registrations,
        restore: () => {
            Module._load = originalLoad;
        },
    };
};

const stubElectronWithFailure = () => {
    const registrations = [];

    const stub = {
        globalShortcut: {
            register: (accelerator, callback) => {
                registrations.push({ type: 'register', accelerator, callback });
                return false;
            },
            unregister: (accelerator) => {
                registrations.push({ type: 'unregister', accelerator });
            },
        },
    };

    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'electron') {
            return stub;
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    return {
        registrations,
        restore: () => {
            Module._load = originalLoad;
        },
    };
};

test('registerRecordingHotkey registers and invokes the handler', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    let called = false;
    const result = hotkeys.registerRecordingHotkey({
        onRecording: () => {
            called = true;
        },
    });

    assert.equal(result.ok, true);
    assert.equal(result.accelerator, hotkeys.DEFAULT_RECORDING_HOTKEY);
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].type, 'register');
    assert.equal(registrations[0].accelerator, hotkeys.DEFAULT_RECORDING_HOTKEY);

    registrations[0].callback();
    assert.equal(called, true);

    hotkeys.unregisterGlobalHotkeys();
    assert.equal(registrations[1].type, 'unregister');
    assert.equal(registrations[1].accelerator, hotkeys.DEFAULT_RECORDING_HOTKEY);

    restore();
    resetHotkeysModule();
});

test('registerRecordingHotkey reports failure when registration fails', () => {
    const { registrations, restore } = stubElectronWithFailure();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const result = hotkeys.registerRecordingHotkey({
        onRecording: () => {},
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'registration-failed');
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].type, 'register');

    hotkeys.unregisterGlobalHotkeys();
    assert.equal(registrations.length, 1);

    restore();
    resetHotkeysModule();
});

test('registerRecordingHotkey returns missing-handler when no handler provided', () => {
    const { restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const result = hotkeys.registerRecordingHotkey({});

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing-handler');

    restore();
    resetHotkeysModule();
});

test('unregisterGlobalHotkeys unregisters recording hotkey', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    hotkeys.registerRecordingHotkey({ onRecording: () => {} });

    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].accelerator, hotkeys.DEFAULT_RECORDING_HOTKEY);

    hotkeys.unregisterGlobalHotkeys();

    assert.equal(registrations.length, 2);
    assert.equal(registrations[1].type, 'unregister');
    assert.equal(registrations[1].accelerator, hotkeys.DEFAULT_RECORDING_HOTKEY);

    restore();
    resetHotkeysModule();
});

test('registerRecordingHotkey uses custom accelerator', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const customAccelerator = 'Alt+Shift+R';
    const result = hotkeys.registerRecordingHotkey({
        onRecording: () => {},
        accelerator: customAccelerator,
    });

    assert.equal(result.ok, true);
    assert.equal(result.accelerator, customAccelerator);
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].accelerator, customAccelerator);

    hotkeys.unregisterGlobalHotkeys();
    assert.equal(registrations[1].accelerator, customAccelerator);

    restore();
    resetHotkeysModule();
});

test('registerRecordingHotkey returns disabled when accelerator is empty', () => {
    const { restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const result = hotkeys.registerRecordingHotkey({
        onRecording: () => {},
        accelerator: '',
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'disabled');

    restore();
    resetHotkeysModule();
});

// ============================================================================
// Suspend/Resume flow tests (for hotkey recording)
// ============================================================================

test('unregisterGlobalHotkeys can be called when no hotkeys are registered', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    // Should not throw
    hotkeys.unregisterGlobalHotkeys();
    assert.equal(registrations.length, 0);

    restore();
    resetHotkeysModule();
});

test('hotkeys can be re-registered after unregistration (suspend/resume flow)', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    // Initial registration
    let recordingCalled = false;
    hotkeys.registerRecordingHotkey({
        onRecording: () => {
            recordingCalled = true;
        },
        accelerator: 'CommandOrControl+R',
    });

    assert.equal(registrations.length, 1);

    // Suspend (unregister)
    hotkeys.unregisterGlobalHotkeys();
    assert.equal(registrations.length, 2); // 1 register + 1 unregister

    // Resume (re-register with same accelerators)
    const recordingResult = hotkeys.registerRecordingHotkey({
        onRecording: () => {
            recordingCalled = true;
        },
        accelerator: 'CommandOrControl+R',
    });

    assert.equal(recordingResult.ok, true);
    assert.equal(registrations.length, 3); // 1 register + 1 unregister + 1 register

    // Verify callbacks still work
    registrations[2].callback(); // recording
    assert.equal(recordingCalled, true);

    hotkeys.unregisterGlobalHotkeys();
    restore();
    resetHotkeysModule();
});

test('hotkeys can be re-registered with different accelerators after suspend', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    // Initial registration with default accelerator
    hotkeys.registerRecordingHotkey({ onRecording: () => {} });

    assert.equal(registrations[0].accelerator, hotkeys.DEFAULT_RECORDING_HOTKEY);

    // Suspend
    hotkeys.unregisterGlobalHotkeys();

    // Resume with new accelerators
    hotkeys.registerRecordingHotkey({
        onRecording: () => {},
        accelerator: 'Alt+Shift+R',
    });

    assert.equal(registrations[2].accelerator, 'Alt+Shift+R');

    hotkeys.unregisterGlobalHotkeys();
    restore();
    resetHotkeysModule();
});

test('multiple suspend calls do not cause errors', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    hotkeys.registerRecordingHotkey({ onRecording: () => {} });

    // First suspend
    hotkeys.unregisterGlobalHotkeys();
    // Second suspend (should be no-op, not throw)
    hotkeys.unregisterGlobalHotkeys();
    // Third suspend
    hotkeys.unregisterGlobalHotkeys();

    // Should only have 1 register + 1 unregister
    assert.equal(registrations.length, 2);

    restore();
    resetHotkeysModule();
});

test('unregister only affects currently registered hotkeys', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    // Only register recording hotkey
    hotkeys.registerRecordingHotkey({ onRecording: () => {} });

    hotkeys.unregisterGlobalHotkeys();

    // Should have 1 register + 1 unregister (not 2 unregisters)
    assert.equal(registrations.length, 2);
    assert.equal(registrations[0].type, 'register');
    assert.equal(registrations[1].type, 'unregister');
    assert.equal(registrations[1].accelerator, hotkeys.DEFAULT_RECORDING_HOTKEY);

    restore();
    resetHotkeysModule();
});
