const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTrayMenuTemplate } = require('../src/menu');

test('buildTrayMenuTemplate returns the expected items', () => {
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onQuit: () => {},
    });

    const labels = template.filter((item) => item.label).map((item) => item.label);

    assert.deepEqual(labels, [
        'Start Recording',
        'Settings',
        'Quit',
    ]);
    assert.equal(template[2].type, 'separator');
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

    const settingsItem = template.find((item) => item.label === 'Settings');
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

    const quitItem = template.find((item) => item.label === 'Quit');
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

    const recordingItem = template.find((item) => item.label === 'Start Recording');
    assert.ok(recordingItem);

    recordingItem.click();

    assert.equal(recordingCalls, 1);
    assert.equal(openSettingsCalls, 0);
});

test('buildTrayMenuTemplate uses resume label when paused', () => {
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onQuit: () => {},
        recordingPaused: true,
    });

    const recordingItem = template.find((item) => item.label === 'Resume Recording');

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
