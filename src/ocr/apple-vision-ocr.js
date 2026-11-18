const fs = require('node:fs/promises')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const { normalizeAppString } = require('../utils/strings')

const execFileAsync = promisify(execFile)

// Apple Vision has been observed to block forever inside the helper (macOS 27.x), so every
// helper run is bounded. A hung run is killed and retried: the hang is nondeterministic and a
// retry of the same image normally succeeds.
const DEFAULT_OCR_TIMEOUT_MS = 30 * 1000
const DEFAULT_OCR_TIMEOUT_RETRIES = 2
const MAX_OCR_TIMEOUT_RETRIES = 10
const OCR_MAX_BUFFER_BYTES = 1024 * 1024 * 50

class AppleVisionOcrTimeoutError extends Error {
  constructor({ timeoutMs, attempts } = {}) {
    super(`Apple Vision OCR helper timed out after ${timeoutMs}ms (${attempts} attempts)`)
    this.name = 'AppleVisionOcrTimeoutError'
    this.code = 'APPLE_VISION_OCR_TIMEOUT'
    this.timeoutMs = timeoutMs
    this.attempts = attempts
  }
}

const isUnset = (value) => value === undefined || value === null || value === ''

const normalizeOcrTimeoutMs = (value) => {
  if (isUnset(value)) {
    return DEFAULT_OCR_TIMEOUT_MS
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OCR_TIMEOUT_MS
  }
  return Math.floor(parsed)
}

const normalizeOcrTimeoutRetries = (value) => {
  if (isUnset(value)) {
    return DEFAULT_OCR_TIMEOUT_RETRIES
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_OCR_TIMEOUT_RETRIES
  }
  return Math.min(parsed, MAX_OCR_TIMEOUT_RETRIES)
}

// execFile sets `killed` only when it killed the child itself, i.e. when our timeout fired.
const isHelperTimeoutError = (error) => Boolean(error && error.killed === true)

const execOcrHelperWithTimeout = async ({
  binaryPath,
  args,
  imagePath,
  timeoutMs,
  timeoutRetries,
  logger = console
} = {}) => {
  const maxAttempts = timeoutRetries + 1
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await execFileAsync(binaryPath, args, {
        maxBuffer: OCR_MAX_BUFFER_BYTES,
        timeout: timeoutMs,
        killSignal: 'SIGKILL'
      })
    } catch (error) {
      if (!isHelperTimeoutError(error)) {
        throw error
      }
      const willRetry = attempt < maxAttempts
      logger.warn('Apple Vision OCR helper timed out', {
        imagePath,
        attempt,
        maxAttempts,
        timeoutMs,
        willRetry
      })
      if (!willRetry) {
        throw new AppleVisionOcrTimeoutError({ timeoutMs, attempts: attempt })
      }
    }
  }
  throw new AppleVisionOcrTimeoutError({ timeoutMs, attempts: maxAttempts })
}

const escapeForQuotedBullet = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const buildMarkdownLayoutFromOcr = ({
  imagePath,
  meta,
  lines,
  appName,
  appBundleId,
  appTitle,
  appLabelSource,
  visibleWindowNames
} = {}) => {
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
  const normalizedAppName = normalizeAppString(appName, 'unknown')
  const normalizedAppBundleId = normalizeAppString(appBundleId, 'unknown')
  const normalizedAppTitle = normalizeAppString(appTitle, 'unknown')
  const normalizedAppLabelSource = normalizeAppString(appLabelSource, 'unknown')
  const normalizedVisibleWindowNames = Array.isArray(visibleWindowNames)
    ? visibleWindowNames.filter((item) => typeof item === 'string')
    : []
  const normalizedVisibleWindowYamlLines =
    normalizedVisibleWindowNames.length > 0
      ? [
          'visible_windows:',
          ...normalizedVisibleWindowNames.map((name) => `  - "${escapeForQuotedBullet(String(name))}"`)
        ]
      : ['visible_windows: []']

  const normalizedLines = Array.isArray(lines)
    ? lines.map((line) => String(line).trim()).filter(Boolean)
    : []

  const ocrLines = normalizedLines.length > 0 ? normalizedLines : ['NO_TEXT_DETECTED']
  const ocrBullets = ocrLines.map((line) => `- "${escapeForQuotedBullet(line)}"`).join('\n')

  const basename = imagePath ? path.basename(imagePath) : 'unknown'

  return [
    '---',
    'format: familiar-layout-v0',
    'extractor: apple-vision-ocr',
    `source_image: ${basename}`,
    `screen_resolution: ${resolution}`,
    'grid: unknown',
    `app: ${normalizedAppName}`,
    `app_bundle_id: ${normalizedAppBundleId}`,
    `window_title_raw: ${normalizedAppTitle}`,
    `window_title_norm: ${normalizedAppTitle}`,
    `app_label_source: ${normalizedAppLabelSource}`,
    ...normalizedVisibleWindowYamlLines,
    'url: unknown',
    'ocr_engine: apple-vision',
    `ocr_level: ${level}`,
    `ocr_languages: ${languages}`,
    `ocr_uses_language_correction: ${usesCorrection ? 'true' : 'false'}`,
    minConfidence === undefined ? null : `ocr_min_confidence: ${minConfidence}`,
    '---',
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
  const envOverride = process.env.FAMILIAR_APPLE_VISION_OCR_BINARY
  if (envOverride && (await fileExists(envOverride))) {
    return envOverride
  }

  // In packaged Electron apps, native helpers are typically shipped as extra resources.
  // We intentionally keep the expected location simple and configurable via env override.
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : ''
  if (resourcesPath) {
    const packagedCandidate = path.join(resourcesPath, 'familiar-ocr-helper')
    if (await fileExists(packagedCandidate)) {
      return packagedCandidate
    }
  }

  // Dev fallback: repoRoot/code/desktopapp/scripts/bin/familiar-ocr-helper
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..')
  const devCandidate = path.join(repoRoot, 'code', 'desktopapp', 'scripts', 'bin', 'familiar-ocr-helper')
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
  emitObservations,
  timeoutMs,
  timeoutRetries,
  logger = console
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

  const { stdout } = await execOcrHelperWithTimeout({
    binaryPath,
    args,
    imagePath,
    timeoutMs: normalizeOcrTimeoutMs(timeoutMs),
    timeoutRetries: normalizeOcrTimeoutRetries(timeoutRetries),
    logger
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
  DEFAULT_OCR_TIMEOUT_MS,
  DEFAULT_OCR_TIMEOUT_RETRIES,
  AppleVisionOcrTimeoutError,
  normalizeOcrTimeoutMs,
  normalizeOcrTimeoutRetries,
  escapeForQuotedBullet,
  buildMarkdownLayoutFromOcr,
  normalizeOcrLevel,
  normalizeLanguages,
  normalizeMinConfidence,
  resolveAppleVisionOcrBinaryPath,
  runAppleVisionOcrBinary
}
