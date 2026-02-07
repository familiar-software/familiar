const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseArgs,
    normalizeLevel,
    normalizeLanguages,
    normalizeMinConfidence,
    escapeForQuotedBullet,
    buildMarkdownLayoutFromOcr,
} = require('../../../scripts/apple-vision-ocr-image-to-markdown');

test('apple-vision-ocr script: parseArgs handles flags and positional image path', () => {
    const args = parseArgs([
        '/tmp/image.png',
        '--out',
        '/tmp/out.md',
        '--level',
        'fast',
        '--languages',
        'en-US, es-ES',
        '--no-correction',
        '--min-confidence',
        '0.35',
        '--debug-json',
    ]);

    assert.equal(args._[0], '/tmp/image.png');
    assert.equal(args.out, '/tmp/out.md');
    assert.equal(args.level, 'fast');
    assert.equal(args.languages, 'en-US, es-ES');
    assert.equal(args.noCorrection, true);
    assert.equal(args.minConfidence, '0.35');
    assert.equal(args.debugJson, true);
});

test('apple-vision-ocr script: normalize helpers validate inputs', () => {
    assert.equal(normalizeLevel(), 'accurate');
    assert.equal(normalizeLevel('FAST'), 'fast');
    assert.throws(() => normalizeLevel('nope'), /Invalid --level/);

    assert.equal(normalizeLanguages(), '');
    assert.equal(normalizeLanguages('en-US, es-ES,, '), 'en-US,es-ES');

    assert.equal(normalizeMinConfidence(), 0.0);
    assert.equal(normalizeMinConfidence('0.5'), 0.5);
    assert.throws(() => normalizeMinConfidence('2'), /Invalid --min-confidence/);
});

test('apple-vision-ocr script: buildMarkdownLayoutFromOcr emits stable jiminy layout skeleton', () => {
    const markdown = buildMarkdownLayoutFromOcr({
        imagePath: '/some/dir/screenshot.png',
        meta: {
            image_width: 1200,
            image_height: 800,
            level: 'accurate',
            languages: ['en-US'],
            uses_language_correction: true,
            min_confidence: 0.2,
        },
        lines: ['Hello "world"', 'Second line'],
    });

    assert.ok(markdown.includes('format: jiminy-layout-v0\n'));
    assert.ok(markdown.includes('extractor: apple-vision-ocr\n'));
    assert.ok(markdown.includes('source_image: screenshot.png\n'));
    assert.ok(markdown.includes('screen_resolution: 1200x800\n'));
    assert.ok(markdown.includes('# OCR\n'));
    assert.ok(markdown.includes('- "Hello \\"world\\""\n'));
    assert.ok(markdown.includes('- "Second line"\n'));
});

test('apple-vision-ocr script: escapeForQuotedBullet escapes backslashes and quotes', () => {
    assert.equal(escapeForQuotedBullet(String.raw`a\b`), String.raw`a\\b`);
    assert.equal(escapeForQuotedBullet('a"b'), 'a\\"b');
});
