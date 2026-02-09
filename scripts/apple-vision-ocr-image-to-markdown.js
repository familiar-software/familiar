#!/usr/bin/env node

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { writeExtractionFile } = require('../src/utils/extraction-files');

const execFileAsync = promisify(execFile);

const SWIFT_OCR_SCRIPT = path.resolve(__dirname, 'apple-vision-ocr.swift');
const DEFAULT_OCR_BINARY_PATH = path.resolve(__dirname, 'bin', 'apple-vision-ocr');

const resolveOcrBinaryPath = () => {
    const override = process.env.JIMINY_APPLE_VISION_OCR_BINARY;
    if (override && String(override).trim()) {
        return path.resolve(String(override));
    }
    return DEFAULT_OCR_BINARY_PATH;
};

const usage = () =>
    [
        'Usage:',
        '  node code/desktopapp/scripts/apple-vision-ocr-image-to-markdown.js <image-path> [--out <path>] [--level accurate|fast] [--languages en-US,es-ES] [--no-correction] [--min-confidence 0.0-1.0] [--debug-json] [--observations] [--use-swift]',
        '',
        'Notes:',
        '  - Local-only OCR using Apple Vision (macOS). No API key required.',
        '  - By default, runs the prebuilt helper binary at code/desktopapp/scripts/bin/apple-vision-ocr.',
        '  - If the binary is missing, run: ./code/desktopapp/scripts/build-apple-vision-ocr.sh',
        '  - Fallback mode (slower): --use-swift uses `xcrun swift` to run the Swift source directly.',
        '  - By default, disables OCR observations (bounding boxes) for performance; enable with --observations.',
        '',
    ].join('\n');

const parseArgs = (argv) => {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--out') {
            args.out = argv[i + 1];
            i += 1;
            continue;
        }
        if (arg.startsWith('--out=')) {
            args.out = arg.split('=')[1];
            continue;
        }
        if (arg === '--level') {
            args.level = argv[i + 1];
            i += 1;
            continue;
        }
        if (arg.startsWith('--level=')) {
            args.level = arg.split('=')[1];
            continue;
        }
        if (arg === '--languages' || arg === '--langs' || arg === '--lang') {
            args.languages = argv[i + 1];
            i += 1;
            continue;
        }
        if (
            arg.startsWith('--languages=') ||
            arg.startsWith('--langs=') ||
            arg.startsWith('--lang=')
        ) {
            args.languages = arg.split('=')[1];
            continue;
        }
        if (arg === '--no-correction') {
            args.noCorrection = true;
            continue;
        }
        if (arg === '--min-confidence') {
            args.minConfidence = argv[i + 1];
            i += 1;
            continue;
        }
        if (arg.startsWith('--min-confidence=')) {
            args.minConfidence = arg.split('=')[1];
            continue;
        }
        if (arg === '--debug-json') {
            args.debugJson = true;
            continue;
        }
        if (arg === '--observations') {
            args.observations = true;
            continue;
        }
        if (arg === '--use-swift') {
            args.useSwift = true;
            continue;
        }
        if (arg === '--help' || arg === '-h') {
            args.help = true;
            continue;
        }
        if (arg.startsWith('-')) {
            throw new Error(`Unknown option: ${arg}`);
        }
        args._.push(arg);
    }
    return args;
};

const ensureImagePath = async (imagePath) => {
    if (!imagePath) {
        throw new Error('Image path is required.');
    }
    const stats = await fs.stat(imagePath);
    if (!stats.isFile()) {
        throw new Error(`Image path must be a file: ${imagePath}`);
    }
};

const normalizeLevel = (level) => {
    if (!level) {
        return 'accurate';
    }
    const normalized = String(level).trim().toLowerCase();
    if (normalized === 'accurate' || normalized === 'fast') {
        return normalized;
    }
    throw new Error(`Invalid --level: ${level} (expected accurate|fast)`);
};

const normalizeMinConfidence = (value) => {
    if (value === undefined || value === null || value === '') {
        return 0.0;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(`Invalid --min-confidence: ${value} (expected 0.0..1.0)`);
    }
    return parsed;
};

const normalizeLanguages = (raw) => {
    if (!raw) {
        return '';
    }
    return String(raw)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .join(',');
};

const runAppleVisionOcr = async ({
    imagePath,
    level,
    languages,
    usesLanguageCorrection,
    minConfidence,
    useSwift,
    emitObservations,
} = {}) => {
    const OCR_BINARY_PATH = resolveOcrBinaryPath();
    const binaryExists = await fs
        .stat(OCR_BINARY_PATH)
        .then((stats) => stats.isFile())
        .catch(() => false);

    const ocrArgs = [
        '--image',
        imagePath,
        '--level',
        level,
        '--min-confidence',
        String(minConfidence),
    ];

    if (!usesLanguageCorrection) {
        ocrArgs.push('--no-correction');
    }

    if (languages) {
        ocrArgs.push('--languages', languages);
    }

    if (!emitObservations) {
        ocrArgs.push('--no-observations');
    }

    if (!useSwift && binaryExists) {
        const { stdout } = await execFileAsync(OCR_BINARY_PATH, ocrArgs, {
            maxBuffer: 1024 * 1024 * 50,
        });

        let parsed;
        try {
            parsed = JSON.parse(stdout);
        } catch (error) {
            throw new Error(
                `Failed to parse Apple OCR JSON output. stdout begins with: ${JSON.stringify(
                    String(stdout).slice(0, 200)
                )}`
            );
        }

        const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
        const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
        return { meta, lines, raw: parsed };
    }

    const run = async (env) =>
        execFileAsync('xcrun', ['swift', SWIFT_OCR_SCRIPT, ...ocrArgs], {
            maxBuffer: 1024 * 1024 * 50,
            env,
        });

    let stdout;
    try {
        ({ stdout } = await run({ ...process.env, __JIMINY_OCR_MODE: 'swift' }));
    } catch (error) {
        const combined = String(error?.stderr || '') + String(error?.stdout || '') + String(error?.message || '');
        const shouldRetry =
            combined.includes('ModuleCache') &&
            (combined.includes('Operation not permitted') || combined.includes('Permission denied'));

        if (!shouldRetry) {
            throw error;
        }

        const cacheRoot = path.join(os.tmpdir(), 'jiminy-apple-vision-ocr-cache');
        await fs.mkdir(cacheRoot, { recursive: true });
        ({ stdout } = await run({
            ...process.env,
            __JIMINY_OCR_MODE: 'swift',
            HOME: cacheRoot,
            XDG_CACHE_HOME: cacheRoot,
            TMPDIR: os.tmpdir(),
        }));
    }

    let parsed;
    try {
        parsed = JSON.parse(stdout);
    } catch (error) {
        throw new Error(
            `Failed to parse Apple OCR JSON output. stdout begins with: ${JSON.stringify(
                String(stdout).slice(0, 200)
            )}`
        );
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Apple OCR returned invalid payload.');
    }

    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const lines = Array.isArray(parsed.lines) ? parsed.lines : [];

    return { meta, lines, raw: parsed };
};

const escapeForQuotedBullet = (value) => {
    // Keep output stable and easy to parse: "- \"...\""
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
};

const buildMarkdownLayoutFromOcr = ({ imagePath, meta, lines } = {}) => {
    const width = Number(meta?.image_width) || null;
    const height = Number(meta?.image_height) || null;
    const resolution = width && height ? `${width}x${height}` : 'unknown';

    const languages =
        Array.isArray(meta?.languages) && meta.languages.length > 0
            ? meta.languages.join(',')
            : 'auto';

    const usesCorrection =
        typeof meta?.uses_language_correction === 'boolean' ? meta.uses_language_correction : true;

    const level = meta?.level || 'accurate';
    const minConfidence =
        typeof meta?.min_confidence === 'number' ? meta.min_confidence : undefined;

    const normalizedLines = Array.isArray(lines)
        ? lines.map((line) => String(line).trim()).filter(Boolean)
        : [];

    const ocrLines =
        normalizedLines.length > 0 ? normalizedLines : ['NO_TEXT_DETECTED'];

    const ocrBullets = ocrLines.map((line) => `- "${escapeForQuotedBullet(line)}"`).join('\n');

    const basename = imagePath ? path.basename(imagePath) : 'unknown';

    return [
        '---',
        'format: jiminy-layout-v0',
        `extractor: apple-vision-ocr`,
        `source_image: ${basename}`,
        `screen_resolution: ${resolution}`,
        'grid: unknown',
        'app: unknown',
        'window_title_raw: unknown',
        'window_title_norm: unknown',
        'url: unknown',
        `ocr_engine: apple-vision`,
        `ocr_level: ${level}`,
        `ocr_languages: ${languages}`,
        `ocr_uses_language_correction: ${usesCorrection ? 'true' : 'false'}`,
        minConfidence === undefined ? null : `ocr_min_confidence: ${minConfidence}`,
        '---',
        '# Layout Map',
        `SCREEN ${resolution}`,
        'GRID unknown',
        width && height
            ? `[CONTENT] (0,0)-(${width},${height}) text: "UNCLEAR (local OCR only; no layout inference)"`
            : `[CONTENT] (x1,y1)-(x2,y2) text: "UNCLEAR (local OCR only; no layout inference)"`,
        '',
        '# OCR',
        ocrBullets,
        '',
    ]
        .filter((line) => line !== null)
        .join('\n');
};

const writeOutput = async ({ markdown, imagePath, outPath }) => {
    if (!markdown) {
        throw new Error('No markdown to write.');
    }
    if (!outPath) {
        return writeExtractionFile({ imagePath, markdown });
    }
    const resolved = path.resolve(outPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    const payload = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
    await fs.writeFile(resolved, payload, 'utf-8');
    return resolved;
};

const runCli = async (argv = process.argv.slice(2)) => {
    const args = parseArgs(argv);
    if (args.help || args._.length === 0) {
        console.info(usage());
        process.exit(args.help ? 0 : 1);
    }

    const imagePath = args._[0];
    if (args._.length > 1) {
        console.warn('Only the first image path will be used.');
    }

    await ensureImagePath(imagePath);

    const level = normalizeLevel(args.level);
    const languages = normalizeLanguages(args.languages);
    const usesLanguageCorrection = !args.noCorrection;
    const minConfidence = normalizeMinConfidence(args.minConfidence);
    const emitObservations = Boolean(args.observations || args.debugJson);

    console.info('Starting Apple Vision OCR', {
        imagePath,
        level,
        languages: languages || 'auto',
        usesLanguageCorrection,
        minConfidence,
        mode: args.useSwift ? 'swift' : 'binary',
        observations: emitObservations,
    });

    const { meta, lines, raw } = await runAppleVisionOcr({
        imagePath,
        level,
        languages,
        usesLanguageCorrection,
        minConfidence,
        useSwift: Boolean(args.useSwift),
        emitObservations,
    });

    if (args.debugJson) {
        console.info('Apple OCR raw JSON', raw);
    }

    const markdown = buildMarkdownLayoutFromOcr({ imagePath, meta, lines });
    const outputPath = await writeOutput({ markdown, imagePath, outPath: args.out });

    console.info('Wrote markdown extraction', { outputPath });
};

if (require.main === module) {
    runCli().catch((error) => {
        console.error('Apple Vision OCR extraction failed', { error: error?.message || error });
        process.exit(1);
    });
}

module.exports = {
    parseArgs,
    normalizeLevel,
    normalizeLanguages,
    normalizeMinConfidence,
    escapeForQuotedBullet,
    buildMarkdownLayoutFromOcr,
    runAppleVisionOcr,
    runCli,
    // Expose the default path for diagnostics; actual resolution happens at runtime
    // (supports JIMINY_APPLE_VISION_OCR_BINARY override).
    OCR_BINARY_PATH: DEFAULT_OCR_BINARY_PATH,
    resolveOcrBinaryPath,
    SWIFT_OCR_SCRIPT,
};
