const test = require('node:test');
const assert = require('node:assert/strict');

const {
    INDICATOR_STATUSES,
    resolveRecordingIndicatorStatus,
    getRecordingIndicatorVisuals,
} = require('../src/recording-status-indicator');

test('resolveRecordingIndicatorStatus returns off when disabled', () => {
    const status = resolveRecordingIndicatorStatus({
        enabled: false,
        state: 'recording',
        manualPaused: false,
        permissionGranted: true,
        permissionStatus: 'granted'
    });

    assert.equal(status, INDICATOR_STATUSES.OFF);
});

test('resolveRecordingIndicatorStatus prioritizes paused over permission issues', () => {
    const status = resolveRecordingIndicatorStatus({
        enabled: true,
        state: 'armed',
        manualPaused: true,
        permissionGranted: false,
        permissionStatus: 'denied'
    });

    assert.equal(status, INDICATOR_STATUSES.PAUSED);
});

test('resolveRecordingIndicatorStatus returns permission-needed when idle and denied', () => {
    const status = resolveRecordingIndicatorStatus({
        enabled: true,
        state: 'armed',
        manualPaused: false,
        permissionGranted: false,
        permissionStatus: 'denied'
    });

    assert.equal(status, INDICATOR_STATUSES.PERMISSION_NEEDED);
});

test('resolveRecordingIndicatorStatus returns recording for active states', () => {
    const status = resolveRecordingIndicatorStatus({
        enabled: true,
        state: 'recording',
        manualPaused: false,
        permissionGranted: false,
        permissionStatus: 'denied'
    });

    assert.equal(status, INDICATOR_STATUSES.RECORDING);
});

test('resolveRecordingIndicatorStatus treats unavailable permission as non-error', () => {
    const status = resolveRecordingIndicatorStatus({
        enabled: true,
        state: 'armed',
        manualPaused: false,
        permissionGranted: true,
        permissionStatus: 'unavailable'
    });

    assert.equal(status, INDICATOR_STATUSES.IDLE);
});

test('getRecordingIndicatorVisuals returns tray + dashboard metadata', () => {
    const visuals = getRecordingIndicatorVisuals({
        enabled: true,
        state: 'armed',
        manualPaused: false,
        permissionGranted: false,
        permissionStatus: 'denied'
    });

    assert.deepEqual(visuals, {
        status: INDICATOR_STATUSES.PERMISSION_NEEDED,
        label: 'Permission needed',
        dotClass: 'bg-red-500',
        trayColorHex: '#ef4444'
    });
});
