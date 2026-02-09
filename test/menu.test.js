const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTrayMenuTemplate } = require('../src/menu');

test('buildTrayMenuTemplate returns the expected items', () => {
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
    });

    const labels = template.filter((item) => item.label).map((item) => item.label);

    assert.deepEqual(labels, [
        'Start Recording',
        'Settings',
        'About',
        'Restart',
        'Quit',
    ]);
    assert.equal(template[3].type, 'separator');
});

test('about click does not trigger open settings', () => {
    let openSettingsCalls = 0;
    let aboutCalls = 0;

    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {
            openSettingsCalls += 1;
        },
        onAbout: () => {
            aboutCalls += 1;
        },
        onRestart: () => {},
        onQuit: () => {},
    });

    const aboutItem = template.find((item) => item.label === 'About');
    assert.ok(aboutItem);

    aboutItem.click();

    assert.equal(aboutCalls, 1);
    assert.equal(openSettingsCalls, 0);
});

test('settings click does not trigger about', () => {
    let openSettingsCalls = 0;
    let aboutCalls = 0;

    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {
            openSettingsCalls += 1;
        },
        onAbout: () => {
            aboutCalls += 1;
        },
        onRestart: () => {},
        onQuit: () => {},
    });

    const openItem = template.find((item) => item.label === 'Settings');
    assert.ok(openItem);

    openItem.click();

    assert.equal(openSettingsCalls, 1);
    assert.equal(aboutCalls, 0);
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
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
    });

    const recordingItem = template.find((item) => item.label === 'Start Recording');
    assert.ok(recordingItem);

    recordingItem.click();

    assert.equal(recordingCalls, 1);
    assert.equal(openSettingsCalls, 0);
});

test('buildTrayMenuTemplate applies accelerators when provided', () => {
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        recordingAccelerator: 'CommandOrControl+R',
    });

    const recordingItem = template.find((item) => item.label === 'Start Recording');

    assert.equal(recordingItem.accelerator, 'CommandOrControl+R');
});

test('buildTrayMenuTemplate omits accelerators when empty', () => {
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        recordingAccelerator: '',
    });

    const recordingItem = template.find((item) => item.label === 'Start Recording');

    assert.equal(recordingItem.accelerator, undefined);
});

test('buildTrayMenuTemplate uses resume label when paused', () => {
    const template = buildTrayMenuTemplate({
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        recordingPaused: true,
    });

    const recordingItem = template.find((item) => item.label === 'Resume Recording');

    assert.ok(recordingItem);
});
