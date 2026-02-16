const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { getTrayIconPathForMenuBar } = require('../src/tray/icon');

const defaultIconPath = path.join(__dirname, '..', 'src', 'icon_white_owl.png');

test('uses the configured icon path', () => {
    const iconPath = getTrayIconPathForMenuBar({
        defaultIconPath,
    });

    assert.equal(iconPath, defaultIconPath);
});
