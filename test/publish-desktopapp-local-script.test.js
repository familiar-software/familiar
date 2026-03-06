const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('publish-desktopapp-local validates GitHub credentials before electron-builder publish', () => {
    const scriptPath = path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'scripts',
        'publish-desktopapp-local.sh'
    );
    const script = fs.readFileSync(scriptPath, 'utf-8');

    assert.match(script, /GH_TOKEN="\$\{GH_TOKEN\/\/.*\\r.*\}"/);
    assert.match(script, /Validating GitHub token against familiar-software\/familiar releases/);
    assert.match(script, /Authorization: Bearer \$GH_TOKEN/);
    assert.match(script, /api\.github\.com\/repos\/familiar-software\/familiar\/releases\?per_page=1/);
    assert.match(script, /GitHub token validation failed/);
});
