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

test('registerCaptureHotkey registers and invokes the handler', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    let called = false;
    const result = hotkeys.registerCaptureHotkey({
        onCapture: () => {
            called = true;
        },
    });

    assert.equal(result.ok, true);
    assert.equal(result.accelerator, hotkeys.DEFAULT_CAPTURE_HOTKEY);
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].type, 'register');
    assert.equal(registrations[0].accelerator, hotkeys.DEFAULT_CAPTURE_HOTKEY);

    registrations[0].callback();
    assert.equal(called, true);

    hotkeys.unregisterGlobalHotkeys();
    assert.equal(registrations[1].type, 'unregister');
    assert.equal(registrations[1].accelerator, hotkeys.DEFAULT_CAPTURE_HOTKEY);

    restore();
    resetHotkeysModule();
});

test('registerCaptureHotkey reports failure when registration fails', () => {
    const { registrations, restore } = stubElectronWithFailure();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const result = hotkeys.registerCaptureHotkey({
        onCapture: () => {},
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

test('registerClipboardHotkey registers and invokes the handler', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    let called = false;
    const result = hotkeys.registerClipboardHotkey({
        onClipboard: () => {
            called = true;
        },
    });

    assert.equal(result.ok, true);
    assert.equal(result.accelerator, hotkeys.DEFAULT_CLIPBOARD_HOTKEY);
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].type, 'register');
    assert.equal(registrations[0].accelerator, hotkeys.DEFAULT_CLIPBOARD_HOTKEY);

    registrations[0].callback();
    assert.equal(called, true);

    hotkeys.unregisterGlobalHotkeys();
    assert.equal(registrations[1].type, 'unregister');
    assert.equal(registrations[1].accelerator, hotkeys.DEFAULT_CLIPBOARD_HOTKEY);

    restore();
    resetHotkeysModule();
});

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

test('registerClipboardHotkey reports failure when registration fails', () => {
    const { registrations, restore } = stubElectronWithFailure();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const result = hotkeys.registerClipboardHotkey({
        onClipboard: () => {},
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

test('registerClipboardHotkey returns missing-handler when no handler provided', () => {
    const { restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const result = hotkeys.registerClipboardHotkey({});

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing-handler');

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

test('unregisterGlobalHotkeys unregisters capture, clipboard, and recording hotkeys', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    hotkeys.registerCaptureHotkey({ onCapture: () => {} });
    hotkeys.registerClipboardHotkey({ onClipboard: () => {} });
    hotkeys.registerRecordingHotkey({ onRecording: () => {} });

    assert.equal(registrations.length, 3);
    assert.equal(registrations[0].accelerator, hotkeys.DEFAULT_CAPTURE_HOTKEY);
    assert.equal(registrations[1].accelerator, hotkeys.DEFAULT_CLIPBOARD_HOTKEY);
    assert.equal(registrations[2].accelerator, hotkeys.DEFAULT_RECORDING_HOTKEY);

    hotkeys.unregisterGlobalHotkeys();

    assert.equal(registrations.length, 6);
    assert.equal(registrations[3].type, 'unregister');
    assert.equal(registrations[3].accelerator, hotkeys.DEFAULT_CAPTURE_HOTKEY);
    assert.equal(registrations[4].type, 'unregister');
    assert.equal(registrations[4].accelerator, hotkeys.DEFAULT_CLIPBOARD_HOTKEY);
    assert.equal(registrations[5].type, 'unregister');
    assert.equal(registrations[5].accelerator, hotkeys.DEFAULT_RECORDING_HOTKEY);

    restore();
    resetHotkeysModule();
});

test('registerCaptureHotkey uses custom accelerator', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const customAccelerator = 'Alt+Shift+S';
    const result = hotkeys.registerCaptureHotkey({
        onCapture: () => {},
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

test('registerClipboardHotkey uses custom accelerator', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const customAccelerator = 'Alt+Shift+C';
    const result = hotkeys.registerClipboardHotkey({
        onClipboard: () => {},
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

test('registerCaptureHotkey returns disabled when accelerator is empty', () => {
    const { restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const result = hotkeys.registerCaptureHotkey({
        onCapture: () => {},
        accelerator: '',
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'disabled');

    restore();
    resetHotkeysModule();
});

test('registerClipboardHotkey returns disabled when accelerator is empty', () => {
    const { restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    const result = hotkeys.registerClipboardHotkey({
        onClipboard: () => {},
        accelerator: '',
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'disabled');

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
    let captureCalled = false;
    let clipboardCalled = false;
    let recordingCalled = false;

    hotkeys.registerCaptureHotkey({
        onCapture: () => {
            captureCalled = true;
        },
        accelerator: 'CommandOrControl+Shift+S',
    });
    hotkeys.registerClipboardHotkey({
        onClipboard: () => {
            clipboardCalled = true;
        },
        accelerator: 'CommandOrControl+C',
    });
    hotkeys.registerRecordingHotkey({
        onRecording: () => {
            recordingCalled = true;
        },
        accelerator: 'CommandOrControl+R',
    });

    assert.equal(registrations.length, 3);

    // Suspend (unregister)
    hotkeys.unregisterGlobalHotkeys();
    assert.equal(registrations.length, 6); // 3 register + 3 unregister

    // Resume (re-register with same accelerators)
    const captureResult = hotkeys.registerCaptureHotkey({
        onCapture: () => {
            captureCalled = true;
        },
        accelerator: 'CommandOrControl+Shift+S',
    });
    const clipboardResult = hotkeys.registerClipboardHotkey({
        onClipboard: () => {
            clipboardCalled = true;
        },
        accelerator: 'CommandOrControl+C',
    });
    const recordingResult = hotkeys.registerRecordingHotkey({
        onRecording: () => {
            recordingCalled = true;
        },
        accelerator: 'CommandOrControl+R',
    });

    assert.equal(captureResult.ok, true);
    assert.equal(clipboardResult.ok, true);
    assert.equal(recordingResult.ok, true);
    assert.equal(registrations.length, 9); // 3 register + 3 unregister + 3 register

    // Verify callbacks still work
    registrations[6].callback(); // capture
    registrations[7].callback(); // clipboard
    registrations[8].callback(); // recording
    assert.equal(captureCalled, true);
    assert.equal(clipboardCalled, true);
    assert.equal(recordingCalled, true);

    hotkeys.unregisterGlobalHotkeys();
    restore();
    resetHotkeysModule();
});

test('hotkeys can be re-registered with different accelerators after suspend', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    // Initial registration with default accelerators
    hotkeys.registerCaptureHotkey({ onCapture: () => {} });
    hotkeys.registerClipboardHotkey({ onClipboard: () => {} });
    hotkeys.registerRecordingHotkey({ onRecording: () => {} });

    assert.equal(registrations[0].accelerator, hotkeys.DEFAULT_CAPTURE_HOTKEY);
    assert.equal(registrations[1].accelerator, hotkeys.DEFAULT_CLIPBOARD_HOTKEY);
    assert.equal(registrations[2].accelerator, hotkeys.DEFAULT_RECORDING_HOTKEY);

    // Suspend
    hotkeys.unregisterGlobalHotkeys();

    // Resume with new accelerators
    hotkeys.registerCaptureHotkey({
        onCapture: () => {},
        accelerator: 'Alt+Shift+X',
    });
    hotkeys.registerClipboardHotkey({
        onClipboard: () => {},
        accelerator: 'Alt+Shift+C',
    });
    hotkeys.registerRecordingHotkey({
        onRecording: () => {},
        accelerator: 'Alt+Shift+R',
    });

    assert.equal(registrations[6].accelerator, 'Alt+Shift+X');
    assert.equal(registrations[7].accelerator, 'Alt+Shift+C');
    assert.equal(registrations[8].accelerator, 'Alt+Shift+R');

    hotkeys.unregisterGlobalHotkeys();
    restore();
    resetHotkeysModule();
});

test('multiple suspend calls do not cause errors', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    hotkeys.registerCaptureHotkey({ onCapture: () => {} });
    hotkeys.registerRecordingHotkey({ onRecording: () => {} });

    // First suspend
    hotkeys.unregisterGlobalHotkeys();
    // Second suspend (should be no-op, not throw)
    hotkeys.unregisterGlobalHotkeys();
    // Third suspend
    hotkeys.unregisterGlobalHotkeys();

    // Should only have 2 register + 2 unregister
    assert.equal(registrations.length, 4);

    restore();
    resetHotkeysModule();
});

test('unregister only affects currently registered hotkeys', () => {
    const { registrations, restore } = stubElectron();
    resetHotkeysModule();
    const hotkeys = require('../src/hotkeys');

    // Only register capture hotkey
    hotkeys.registerCaptureHotkey({ onCapture: () => {} });

    hotkeys.unregisterGlobalHotkeys();

    // Should have 1 register + 1 unregister (not 2 unregisters)
    assert.equal(registrations.length, 2);
    assert.equal(registrations[0].type, 'register');
    assert.equal(registrations[1].type, 'unregister');
    assert.equal(registrations[1].accelerator, hotkeys.DEFAULT_CAPTURE_HOTKEY);

    restore();
    resetHotkeysModule();
});
