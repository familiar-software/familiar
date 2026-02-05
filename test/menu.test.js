const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTrayMenuTemplate } = require('../src/menu');

test('buildTrayMenuTemplate returns the expected items', () => {
    const template = buildTrayMenuTemplate({
        onClipboard: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
    });

    const labels = template.filter((item) => item.label).map((item) => item.label);

    assert.deepEqual(labels, ['Capture Clipboard', 'Dashboard', 'About', 'Restart', 'Quit']);
    assert.equal(template[3].type, 'separator');
});

test('about click does not trigger open settings', () => {
    let openSettingsCalls = 0;
    let aboutCalls = 0;

    const template = buildTrayMenuTemplate({
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

test('clipboard click does not trigger settings', () => {
    let clipboardCalls = 0;
    let openSettingsCalls = 0;

    const template = buildTrayMenuTemplate({
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
    assert.equal(openSettingsCalls, 0);
});

test('buildTrayMenuTemplate applies accelerators when provided', () => {
    const template = buildTrayMenuTemplate({
        onClipboard: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        clipboardAccelerator: 'CommandOrControl+J',
    });

    const clipboardItem = template.find((item) => item.label === 'Capture Clipboard');

    assert.equal(clipboardItem.accelerator, 'CommandOrControl+J');
});

test('buildTrayMenuTemplate omits accelerators when empty', () => {
    const template = buildTrayMenuTemplate({
        onClipboard: () => {},
        onOpenSettings: () => {},
        onAbout: () => {},
        onRestart: () => {},
        onQuit: () => {},
        clipboardAccelerator: '',
    });

    const clipboardItem = template.find((item) => item.label === 'Capture Clipboard');

    assert.equal(clipboardItem.accelerator, undefined);
});
