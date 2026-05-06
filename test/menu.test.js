const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTrayMenuTemplate, PAUSE_DURATIONS, formatPausedLabel } = require('../src/menu');
const { microcopy } = require('../src/microcopy');

test('buildTrayMenuTemplate returns the expected items', () => {
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onQuit: () => {},
    });

    const labels = template.filter((item) => item.label).map((item) => item.label);

    assert.deepEqual(labels, [
        microcopy.tray.recording.startCapturing,
        microcopy.tray.actions.settings,
        microcopy.tray.actions.quit,
    ]);
    assert.equal(template[2].type, 'separator');
});

test('buildTrayMenuTemplate uses recording label while active', () => {
    const recordingState = { state: 'recording', manualPaused: false };
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onQuit: () => {},
        recordingState
    });

    const recordingItem = template.find((item) => item.label === 'Capturing');

    assert.ok(recordingItem);
});

test('settings click does not trigger quit', () => {
    let openSettingsCalls = 0;
    let quitCalls = 0;

    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {
            openSettingsCalls += 1;
        },
        onQuit: () => {
            quitCalls += 1;
        },
    });

    const settingsItem = template.find((item) => item.label === microcopy.tray.actions.settings);
    assert.ok(settingsItem);

    settingsItem.click();

    assert.equal(openSettingsCalls, 1);
    assert.equal(quitCalls, 0);
});

test('quit click does not trigger open settings', () => {
    let openSettingsCalls = 0;
    let quitCalls = 0;

    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {
            openSettingsCalls += 1;
        },
        onQuit: () => {
            quitCalls += 1;
        },
    });

    const quitItem = template.find((item) => item.label === microcopy.tray.actions.quit);
    assert.ok(quitItem);

    quitItem.click();

    assert.equal(quitCalls, 1);
    assert.equal(openSettingsCalls, 0);
});

test('recording item click does not trigger settings', () => {
    let recordingCalls = 0;
    let openSettingsCalls = 0;

    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {
            recordingCalls += 1;
        },
        onOpenSettings: () => {
            openSettingsCalls += 1;
        },
        onQuit: () => {},
    });

    const recordingItem = template.find((item) => item.label === microcopy.tray.recording.startCapturing);
    assert.ok(recordingItem);

    recordingItem.click();

    assert.equal(recordingCalls, 1);
    assert.equal(openSettingsCalls, 0);
});

test('buildTrayMenuTemplate shows paused label with countdown when paused', () => {
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onQuit: () => {},
        recordingPaused: true,
        recordingState: {
            manualPaused: true,
            pauseRemainingMs: 61000
        }
    });

    assert.ok(template[0].label.includes('remaining'));
    assert.equal(template[0].toolTip, 'Click to resume');
});

test('buildTrayMenuTemplate keeps paused label at fallback when remaining time is zero', () => {
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onQuit: () => {},
        recordingPaused: true,
        recordingState: {
            manualPaused: true,
            pauseRemainingMs: 0
        }
    });

    const recordingItem = template.find(
        (item) => item.label === 'Paused'
    );

    assert.ok(recordingItem);
});

test('buildTrayMenuTemplate includes status icon when provided', () => {
    const recordingStatusIcon = { id: 'dot' };
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onQuit: () => {},
        recordingStatusIcon
    });

    assert.equal(template[0].icon, recordingStatusIcon);
});

test('buildTrayMenuTemplate shows pause duration submenu when recording', () => {
    const recordingState = { state: 'recording', manualPaused: false };
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onQuit: () => {},
        recordingState
    });

    const recordingItem = template[0];
    assert.ok(recordingItem.submenu, 'recording item should have a submenu');
    assert.equal(recordingItem.submenu.length, PAUSE_DURATIONS.length);
    assert.equal(recordingItem.submenu[0].label, 'Pause for 5 minutes');
    assert.equal(recordingItem.submenu[1].label, 'Pause for 10 minutes');
    assert.equal(recordingItem.submenu[2].label, 'Pause for 30 minutes');
    assert.equal(recordingItem.submenu[3].label, 'Pause for 1 hour');
});

test('pause submenu items pass durationMs to onRecordingPause', () => {
    const pauseCalls = [];
    const recordingState = { state: 'recording', manualPaused: false };
    const template = buildTrayMenuTemplate({
        onRecordingPause: (durationMs) => { pauseCalls.push(durationMs); },
        onOpenSettings: () => {},
        onQuit: () => {},
        recordingState
    });

    template[0].submenu[0].click();
    template[0].submenu[1].click();

    assert.deepEqual(pauseCalls, [5 * 60 * 1000, 10 * 60 * 1000]);
});

test('formatPausedLabel shows countdown when remaining time is positive', () => {
    const label = formatPausedLabel(125000);
    assert.ok(label.includes('2:05'));
    assert.ok(label.includes('remaining'));
});

test('formatPausedLabel falls back to microcopy when remaining is zero', () => {
    const label = formatPausedLabel(0);
    assert.equal(label, 'Paused');
});
