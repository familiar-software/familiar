const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildExtractionPath, writeExtractionFile } = require('../src/utils/extraction-files');

test('buildExtractionPath replaces file extension with extraction suffix', () => {
    const input = '/tmp/2026-01-21_10-00-00-000.png';
    const expected = '/tmp/2026-01-21_10-00-00-000-extraction.md';
    assert.equal(buildExtractionPath(input), expected);
});

test('buildExtractionPath appends extraction suffix when no extension', () => {
    const input = '/tmp/2026-01-21_10-00-00-000';
    const expected = `${input}-extraction.md`;
    assert.equal(buildExtractionPath(input), expected);
});

test('writeExtractionFile writes markdown with newline', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-extract-'));
    const imagePath = path.join(tempDir, 'capture.png');
    const markdown = '# Screenshot Extraction\n\nHello';

    const outputPath = await writeExtractionFile({ imagePath, markdown });
    const saved = await fs.readFile(outputPath, 'utf-8');

    assert.equal(outputPath, path.join(tempDir, 'capture-extraction.md'));
    assert.ok(saved.endsWith('\n'));
    assert.ok(saved.includes('Screenshot Extraction'));
});

