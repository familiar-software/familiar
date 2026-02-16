const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { getTrayIconPathForMenuBar } = require('../src/tray/icon');

const defaultIconPath = path.join(__dirname, '..', 'src', 'icon.png');
const whiteModeIconPath = path.join(__dirname, '..', 'src', 'icon_white_mode.png');

test('chooses white mode icon on macOS when light appearance is active', () => {
    const iconPath = getTrayIconPathForMenuBar({
        platform: 'darwin',
        shouldUseDarkColors: false,
        defaultIconPath,
        whiteModeIconPath,
    });

    assert.equal(iconPath, whiteModeIconPath);
});

test('chooses default icon on macOS when dark appearance is active', () => {
    const iconPath = getTrayIconPathForMenuBar({
        platform: 'darwin',
        shouldUseDarkColors: true,
        defaultIconPath,
        whiteModeIconPath,
    });

    assert.equal(iconPath, defaultIconPath);
});

test('chooses default icon on non-macOS platforms regardless of appearance', () => {
    const iconPath = getTrayIconPathForMenuBar({
        platform: 'linux',
        shouldUseDarkColors: false,
        defaultIconPath,
        whiteModeIconPath,
    });

    assert.equal(iconPath, defaultIconPath);
});
