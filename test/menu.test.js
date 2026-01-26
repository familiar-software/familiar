const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTrayMenuTemplate } = require('../src/menu');

test('buildTrayMenuTemplate returns the expected items', () => {
    const template = buildTrayMenuTemplate({
        onCapture: () => {},
        onClipboard: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
    });

    const labels = template.filter((item) => item.label).map((item) => item.label);

    assert.deepEqual(labels, ['Capture Selection', 'Capture Clipboard', 'Dashboard', 'About', 'Restart', 'Quit']);
    assert.equal(template[4].type, 'separator');
});

test('about click does not trigger open settings', () => {
    let openSettingsCalls = 0;
    let aboutCalls = 0;

    const template = buildTrayMenuTemplate({
        onCapture: () => {},
        onClipboard: () => {},
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
        onCapture: () => {},
        onClipboard: () => {},
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

test('capture click does not trigger about or settings', () => {
    let captureCalls = 0;
    let openSettingsCalls = 0;
    let aboutCalls = 0;

    const template = buildTrayMenuTemplate({
        onCapture: () => {
            captureCalls += 1;
        },
        onClipboard: () => {},
        onOpenSettings: () => {
            openSettingsCalls += 1;
        },
        onAbout: () => {
            aboutCalls += 1;
        },
        onRestart: () => {},
        onQuit: () => {},
    });

    const captureItem = template.find((item) => item.label === 'Capture Selection');
    assert.ok(captureItem);

    captureItem.click();

    assert.equal(captureCalls, 1);
    assert.equal(openSettingsCalls, 0);
    assert.equal(aboutCalls, 0);
});

test('clipboard click does not trigger capture or settings', () => {
    let captureCalls = 0;
    let clipboardCalls = 0;
    let openSettingsCalls = 0;

    const template = buildTrayMenuTemplate({
        onCapture: () => {
            captureCalls += 1;
        },
        onClipboard: () => {
            clipboardCalls += 1;
        },
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
    assert.equal(captureCalls, 0);
    assert.equal(openSettingsCalls, 0);
});

test('buildTrayMenuTemplate applies accelerators when provided', () => {
    const template = buildTrayMenuTemplate({
        onCapture: () => {},
        onClipboard: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        captureAccelerator: 'CommandOrControl+Shift+J',
        clipboardAccelerator: 'CommandOrControl+J',
    });

    const captureItem = template.find((item) => item.label === 'Capture Selection');
    const clipboardItem = template.find((item) => item.label === 'Capture Clipboard');

    assert.equal(captureItem.accelerator, 'CommandOrControl+Shift+J');
    assert.equal(clipboardItem.accelerator, 'CommandOrControl+J');
});

test('buildTrayMenuTemplate omits accelerators when empty', () => {
    const template = buildTrayMenuTemplate({
        onCapture: () => {},
        onClipboard: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        captureAccelerator: '',
        clipboardAccelerator: '',
    });

    const captureItem = template.find((item) => item.label === 'Capture Selection');
    const clipboardItem = template.find((item) => item.label === 'Capture Clipboard');

    assert.equal(captureItem.accelerator, undefined);
    assert.equal(clipboardItem.accelerator, undefined);
});

test('buildTrayMenuTemplate renders recent history items when provided', () => {
    const template = buildTrayMenuTemplate({
        onCapture: () => {},
        onClipboard: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        historyItems: [
            { summary: 'Screenshot -> Analysis', status: 'success' },
            { trigger: 'capture_clipboard', status: 'failed' },
        ],
    });

    const labels = template.filter((item) => item.label).map((item) => item.label);

    assert.equal(labels[0], 'Last: Screenshot -> Analysis (success)');
    assert.equal(labels[1], 'Recent: capture_clipboard (failed)');
    assert.ok(labels.includes('Capture Selection'));
});
