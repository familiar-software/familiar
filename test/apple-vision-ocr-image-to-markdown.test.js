const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    parseArgs,
    normalizeLevel,
    normalizeLanguages,
    normalizeMinConfidence,
    escapeForQuotedBullet,
    buildMarkdownLayoutFromOcr,
    runCli,
} = require('../scripts/apple-vision-ocr-image-to-markdown');

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

test('apple-vision-ocr script: runCli writes stable jiminy markdown via helper binary', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-apple-ocr-test-'));
    const stubBinaryPath = path.join(tempRoot, 'apple-vision-ocr-stub.js');
    const imagePath = path.join(tempRoot, 'image.png');
    const outPath = path.join(tempRoot, 'out.md');

    const priorEnv = process.env.JIMINY_APPLE_VISION_OCR_BINARY;
    process.env.JIMINY_APPLE_VISION_OCR_BINARY = stubBinaryPath;

    try {
        fs.writeFileSync(imagePath, 'fake', 'utf-8');

        fs.writeFileSync(
            stubBinaryPath,
            [
                '#!/usr/bin/env node',
                "const args = process.argv.slice(2);",
                "const get = (flag) => {",
                "  const idx = args.indexOf(flag);",
                "  return idx >= 0 ? args[idx + 1] : undefined;",
                "};",
                "const level = get('--level') || 'accurate';",
                "const minConfidenceRaw = get('--min-confidence') || '0';",
                "const minConfidence = Number(minConfidenceRaw);",
                "const langs = get('--languages');",
                "const languages = langs ? String(langs).split(',').map((v) => v.trim()).filter(Boolean) : [];",
                "const usesCorrection = !args.includes('--no-correction');",
                "const payload = {",
                "  meta: {",
                "    image_width: 1200,",
                "    image_height: 800,",
                "    level,",
                "    languages,",
                "    uses_language_correction: usesCorrection,",
                "    min_confidence: Number.isFinite(minConfidence) ? minConfidence : 0",
                "  },",
                "  lines: ['Hello \"world\"', 'Second line']",
                "};",
                "process.stdout.write(JSON.stringify(payload));",
                '',
            ].join('\n'),
            'utf-8'
        );
        fs.chmodSync(stubBinaryPath, 0o755);

        await runCli([
            imagePath,
            '--out',
            outPath,
            '--level',
            'accurate',
            '--languages',
            'en-US',
            '--min-confidence',
            '0.2',
            '--no-correction',
        ]);

        const markdown = fs.readFileSync(outPath, 'utf-8');

        assert.ok(markdown.includes('format: jiminy-layout-v0\n'));
        assert.ok(markdown.includes('extractor: apple-vision-ocr\n'));
        assert.ok(markdown.includes('source_image: image.png\n'));
        assert.ok(markdown.includes('screen_resolution: 1200x800\n'));
        assert.ok(markdown.includes('ocr_engine: apple-vision\n'));
        assert.ok(markdown.includes('ocr_level: accurate\n'));
        assert.ok(markdown.includes('ocr_languages: en-US\n'));
        assert.ok(markdown.includes('ocr_uses_language_correction: false\n'));
        assert.ok(markdown.includes('ocr_min_confidence: 0.2\n'));
        assert.ok(markdown.includes('# OCR\n'));
        assert.ok(markdown.includes('- "Hello \\"world\\""\n'));
        assert.ok(markdown.includes('- "Second line"\n'));
    } finally {
        if (priorEnv === undefined) {
            delete process.env.JIMINY_APPLE_VISION_OCR_BINARY;
        } else {
            process.env.JIMINY_APPLE_VISION_OCR_BINARY = priorEnv;
        }
    }
});
