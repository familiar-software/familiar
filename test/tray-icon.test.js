const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { getTrayIconPathForMenuBar } = require('../src/tray/icon');

const defaultIconPath = path.join(__dirname, '..', 'src', 'icon.png');
const noWhiteBackgroundIconPath = path.join(__dirname, '..', 'src', 'icon_no_white_background.png');

test('uses icon_no_white_background on macOS in light mode when Reduce Transparency is enabled', () => {
    const iconPath = getTrayIconPathForMenuBar({
        platform: 'darwin',
        shouldUseDarkColors: false,
        reduceTransparencyEnabled: true,
        defaultIconPath,
        reduceTransparencyIconPath: noWhiteBackgroundIconPath,
    });

    assert.equal(iconPath, noWhiteBackgroundIconPath);
});

test('uses icon.png on macOS in light mode when Reduce Transparency is disabled', () => {
    const iconPath = getTrayIconPathForMenuBar({
        platform: 'darwin',
        shouldUseDarkColors: false,
        reduceTransparencyEnabled: false,
        defaultIconPath,
        reduceTransparencyIconPath: noWhiteBackgroundIconPath,
    });

    assert.equal(iconPath, defaultIconPath);
});

test('uses icon.png on macOS in dark mode when Reduce Transparency is enabled', () => {
    const iconPath = getTrayIconPathForMenuBar({
        platform: 'darwin',
        shouldUseDarkColors: true,
        reduceTransparencyEnabled: true,
        defaultIconPath,
        reduceTransparencyIconPath: noWhiteBackgroundIconPath,
    });

    assert.equal(iconPath, defaultIconPath);
});

test('uses icon.png on macOS in dark mode when Reduce Transparency is disabled', () => {
    const iconPath = getTrayIconPathForMenuBar({
        platform: 'darwin',
        shouldUseDarkColors: true,
        reduceTransparencyEnabled: false,
        defaultIconPath,
        reduceTransparencyIconPath: noWhiteBackgroundIconPath,
    });

    assert.equal(iconPath, defaultIconPath);
});

test('uses icon.png on non-macOS regardless of appearance', () => {
    const iconPath = getTrayIconPathForMenuBar({
        platform: 'linux',
        shouldUseDarkColors: false,
        reduceTransparencyEnabled: false,
        defaultIconPath,
        reduceTransparencyIconPath: noWhiteBackgroundIconPath,
    });

    assert.equal(iconPath, defaultIconPath);
});

test('defaults to icon_no_white_background in light mode when reduce-transparency flag is omitted (default ON)', () => {
    const iconPath = getTrayIconPathForMenuBar({
        platform: 'darwin',
        shouldUseDarkColors: false,
        defaultIconPath,
        reduceTransparencyIconPath: noWhiteBackgroundIconPath,
    });

    assert.equal(iconPath, noWhiteBackgroundIconPath);
});
