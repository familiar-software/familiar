const fs = require('node:fs/promises')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)

const escapeForQuotedBullet = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const buildMarkdownLayoutFromOcr = ({ imagePath, meta, lines } = {}) => {
  const width = Number(meta?.image_width) || null
  const height = Number(meta?.image_height) || null
  const resolution = width && height ? `${width}x${height}` : 'unknown'

  const languages =
    Array.isArray(meta?.languages) && meta.languages.length > 0
      ? meta.languages.join(',')
      : 'auto'

  const usesCorrection =
    typeof meta?.uses_language_correction === 'boolean' ? meta.uses_language_correction : true

  const level = meta?.level || 'accurate'
  const minConfidence = typeof meta?.min_confidence === 'number' ? meta.min_confidence : undefined

  const normalizedLines = Array.isArray(lines)
    ? lines.map((line) => String(line).trim()).filter(Boolean)
    : []

  const ocrLines = normalizedLines.length > 0 ? normalizedLines : ['NO_TEXT_DETECTED']
  const ocrBullets = ocrLines.map((line) => `- "${escapeForQuotedBullet(line)}"`).join('\n')

  const basename = imagePath ? path.basename(imagePath) : 'unknown'

  return [
    '---',
    'format: jiminy-layout-v0',
    'extractor: apple-vision-ocr',
    `source_image: ${basename}`,
    `screen_resolution: ${resolution}`,
    'grid: unknown',
    'app: unknown',
    'window_title_raw: unknown',
    'window_title_norm: unknown',
    'url: unknown',
    'ocr_engine: apple-vision',
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
    ''
  ]
    .filter((line) => line !== null)
    .join('\n')
}

const normalizeOcrLevel = (level) => {
  if (!level) {
    return 'accurate'
  }
  const normalized = String(level).trim().toLowerCase()
  if (normalized === 'accurate' || normalized === 'fast') {
    return normalized
  }
  return 'accurate'
}

const normalizeLanguages = (raw) => {
  if (!raw) {
    return ''
  }
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value).trim()).filter(Boolean).join(',')
  }
  return String(raw)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .join(',')
}

const normalizeMinConfidence = (value) => {
  if (value === undefined || value === null || value === '') {
    return 0.0
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return 0.0
  }
  return parsed
}

const fileExists = async (candidatePath) => {
  if (!candidatePath) {
    return false
  }
  try {
    const stats = await fs.stat(candidatePath)
    return stats.isFile()
  } catch (_) {
    return false
  }
}

const resolveAppleVisionOcrBinaryPath = async ({ logger = console } = {}) => {
  const envOverride = process.env.JIMINY_APPLE_VISION_OCR_BINARY
  if (envOverride && (await fileExists(envOverride))) {
    return envOverride
  }

  // In packaged Electron apps, native helpers are typically shipped as extra resources.
  // We intentionally keep the expected location simple and configurable via env override.
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : ''
  if (resourcesPath) {
    const packagedCandidate = path.join(resourcesPath, 'apple-vision-ocr')
    if (await fileExists(packagedCandidate)) {
      return packagedCandidate
    }
  }

  // Dev fallback: repoRoot/code/desktopapp/scripts/bin/apple-vision-ocr
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..')
  const devCandidate = path.join(repoRoot, 'code', 'desktopapp', 'scripts', 'bin', 'apple-vision-ocr')
  if (await fileExists(devCandidate)) {
    return devCandidate
  }

  logger.warn('Apple Vision OCR helper binary not found', {
    env: envOverride || null,
    resourcesPath: resourcesPath || null,
    devCandidate
  })
  return ''
}

const runAppleVisionOcrBinary = async ({
  binaryPath,
  imagePath,
  level,
  languages,
  usesLanguageCorrection,
  minConfidence,
  emitObservations
} = {}) => {
  if (!binaryPath) {
    throw new Error('Apple Vision OCR binary path required.')
  }
  if (!imagePath) {
    throw new Error('Apple Vision OCR image path required.')
  }

  const resolvedLevel = normalizeOcrLevel(level)
  const resolvedLanguages = normalizeLanguages(languages)
  const resolvedMinConfidence = normalizeMinConfidence(minConfidence)
  const resolvedUsesCorrection = usesLanguageCorrection !== false

  const args = [
    '--image',
    imagePath,
    '--level',
    resolvedLevel,
    '--min-confidence',
    String(resolvedMinConfidence)
  ]

  if (!resolvedUsesCorrection) {
    args.push('--no-correction')
  }

  if (resolvedLanguages) {
    args.push('--languages', resolvedLanguages)
  }

  // Bounding boxes are expensive and unused for markdown output unless debugging.
  if (!emitObservations) {
    args.push('--no-observations')
  }

  const { stdout } = await execFileAsync(binaryPath, args, {
    maxBuffer: 1024 * 1024 * 50
  })

  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch (error) {
    throw new Error(
      `Failed to parse Apple OCR JSON output. stdout begins with: ${JSON.stringify(
        String(stdout).slice(0, 200)
      )}`
    )
  }

  const meta = parsed?.meta && typeof parsed.meta === 'object' ? parsed.meta : {}
  const linesOut = Array.isArray(parsed?.lines) ? parsed.lines : []
  return { meta, lines: linesOut, raw: parsed }
}

module.exports = {
  escapeForQuotedBullet,
  buildMarkdownLayoutFromOcr,
  normalizeOcrLevel,
  normalizeLanguages,
  normalizeMinConfidence,
  resolveAppleVisionOcrBinaryPath,
  runAppleVisionOcrBinary
}
