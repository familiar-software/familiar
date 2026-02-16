const test = require('node:test');
const assert = require('node:assert/strict');

const { getReduceTransparencyEnabled } = require('../src/tray/appearance');

test('reads reduce transparency from nativeTheme on macOS', () => {
    assert.equal(
        getReduceTransparencyEnabled({
            platform: 'darwin',
            nativeTheme: { prefersReducedTransparency: true },
        }),
        true
    );
    assert.equal(
        getReduceTransparencyEnabled({
            platform: 'darwin',
            nativeTheme: { prefersReducedTransparency: false },
        }),
        false
    );
});

test('returns false on non-macOS', () => {
    assert.equal(
        getReduceTransparencyEnabled({
            platform: 'linux',
            nativeTheme: { prefersReducedTransparency: true },
        }),
        false
    );
});
