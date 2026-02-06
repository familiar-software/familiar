const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTrayMenuTemplate } = require('../src/menu');

test('buildTrayMenuTemplate returns the expected items', () => {
    const template = buildTrayMenuTemplate({
        onClipboard: () => {},
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
    });

    const labels = template.filter((item) => item.label).map((item) => item.label);

    assert.deepEqual(labels, [
        'Capture Clipboard',
        '10 Minute Pause',
        'Dashboard',
        'About',
        'Restart',
        'Quit',
    ]);
    assert.equal(template[4].type, 'separator');
});

test('about click does not trigger open settings', () => {
    let openSettingsCalls = 0;
    let aboutCalls = 0;

    const template = buildTrayMenuTemplate({
        onClipboard: () => {},
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

test('dashboard click does not trigger about', () => {
    let openSettingsCalls = 0;
    let aboutCalls = 0;

    const template = buildTrayMenuTemplate({
        onClipboard: () => {},
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

    const openItem = template.find((item) => item.label === 'Dashboard');
    assert.ok(openItem);

    openItem.click();

    assert.equal(openSettingsCalls, 1);
    assert.equal(aboutCalls, 0);
});

test('clipboard click does not trigger settings', () => {
    let clipboardCalls = 0;
    let openSettingsCalls = 0;

    const template = buildTrayMenuTemplate({
        onClipboard: () => {
            clipboardCalls += 1;
        },
        onRecordingPause: () => {},
        onOpenSettings: () => {
            openSettingsCalls += 1;
        },
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
    });

    const clipboardItem = template.find((item) => item.label === 'Capture Clipboard');
    assert.ok(clipboardItem);

    clipboardItem.click();

    assert.equal(clipboardCalls, 1);
    assert.equal(openSettingsCalls, 0);
});

test('recording pause click does not trigger settings', () => {
    let recordingCalls = 0;
    let openSettingsCalls = 0;

    const template = buildTrayMenuTemplate({
        onClipboard: () => {},
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

    const recordingItem = template.find((item) => item.label === '10 Minute Pause');
    assert.ok(recordingItem);

    recordingItem.click();

    assert.equal(recordingCalls, 1);
    assert.equal(openSettingsCalls, 0);
});

test('buildTrayMenuTemplate applies accelerators when provided', () => {
    const template = buildTrayMenuTemplate({
        onClipboard: () => {},
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        clipboardAccelerator: 'CommandOrControl+J',
        recordingAccelerator: 'CommandOrControl+R',
    });

    const clipboardItem = template.find((item) => item.label === 'Capture Clipboard');
    const recordingItem = template.find((item) => item.label === '10 Minute Pause');

    assert.equal(clipboardItem.accelerator, 'CommandOrControl+J');
    assert.equal(recordingItem.accelerator, 'CommandOrControl+R');
});

test('buildTrayMenuTemplate omits accelerators when empty', () => {
    const template = buildTrayMenuTemplate({
        onClipboard: () => {},
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        clipboardAccelerator: '',
        recordingAccelerator: '',
    });

    const clipboardItem = template.find((item) => item.label === 'Capture Clipboard');
    const recordingItem = template.find((item) => item.label === '10 Minute Pause');

    assert.equal(clipboardItem.accelerator, undefined);
    assert.equal(recordingItem.accelerator, undefined);
});

test('buildTrayMenuTemplate uses resume label when paused', () => {
    const template = buildTrayMenuTemplate({
        onClipboard: () => {},
        onRecordingPause: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        recordingPaused: true,
    });

    const recordingItem = template.find((item) => item.label === 'Resume');

    assert.ok(recordingItem);
});
