const fsSync = require('node:fs')
const path = require('node:path')

const { createModelProviderClients } = require('../modelProviders')
const { readImageAsBase64, inferMimeType } = require('../utils/image')
const { buildBatchPrompt, parseBatchResponse } = require('./stills-markdown-format')
const {
  resolveAppleVisionOcrBinaryPath,
  runAppleVisionOcrBinary,
  buildMarkdownLayoutFromOcr
} = require('../ocr/apple-vision-ocr')

const PROMPT_PATH = path.join(__dirname, 'stills-markdown-prompt.md')
const PROMPT_TEMPLATE = (() => {
  const contents = fsSync.readFileSync(PROMPT_PATH, 'utf-8')
  const trimmed = contents.trim()
  if (!trimmed) {
    throw new Error('Stills markdown prompt file is empty.')
  }
  return contents.trimEnd()
})()

const isLlmMockEnabled = () => process.env.FAMILIAR_LLM_MOCK === '1'

const normalizeExtractorType = (settings) => {
  const raw = settings?.stills_markdown_extractor
  const type = raw && typeof raw === 'object' ? raw.type : undefined
  const normalized = typeof type === 'string' ? type.trim().toLowerCase() : ''
  if (normalized === 'apple_vision_ocr' || normalized === 'apple-vision-ocr' || normalized === 'apple') {
    return 'apple_vision_ocr'
  }
  if (normalized === 'llm' || normalized === 'cloud' || normalized === 'ai') {
    return 'llm'
  }

  // Default to local when nothing is configured yet.
  return 'apple_vision_ocr'
}

const createLlmVisionExtractor = ({
  settings,
  logger = console,
  isOnlineImpl = async () => true,
  readImageAsBase64Impl = readImageAsBase64,
  inferMimeTypeImpl = inferMimeType,
  createModelProviderClientsImpl = createModelProviderClients
} = {}) => {
  const llmProvider = settings?.stills_markdown_extractor?.llm_provider || {}
  const provider = llmProvider?.provider || ''
  const apiKey = llmProvider?.api_key || ''
  const model = typeof llmProvider?.vision_model === 'string' && llmProvider.vision_model.trim()
    ? llmProvider.vision_model
    : undefined

  const canRun = async () => {
    if (!provider) {
      return {
        ok: false,
        reason: 'missing_llm_provider',
        message: 'Missing LLM provider.'
      }
    }
    if (!apiKey && !isLlmMockEnabled()) {
      return {
        ok: false,
        reason: 'missing_llm_api_key',
        message: 'Missing LLM API key.'
      }
    }

    try {
      const online = await isOnlineImpl()
      if (online === false) {
        return {
          ok: false,
          reason: 'offline',
          message: 'Offline.'
        }
      }
    } catch (error) {
      logger.warn('Stills markdown online check failed; continuing', { error })
    }

    return { ok: true }
  }

  const extractBatch = async ({ rows } = {}) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Map()
    }

    if (isLlmMockEnabled()) {
      const mockText = process.env.FAMILIAR_LLM_MOCK_TEXT || 'gibberish'
      return new Map(rows.map((row) => [
        String(row.id),
        { markdown: mockText, providerLabel: 'mock', modelLabel: 'mock' }
      ]))
    }

    const images = await Promise.all(
      rows.map(async (row) => ({
        id: String(row.id),
        imageBase64: await readImageAsBase64Impl(row.image_path),
        mimeType: inferMimeTypeImpl(row.image_path),
        imagePath: row.image_path
      }))
    )

    const prompt = buildBatchPrompt(PROMPT_TEMPLATE, images.map((image) => image.id))
    const clients = createModelProviderClientsImpl({ provider, apiKey, visionModel: model })
    const responseText = await clients.vision.extractBatch({
      prompt,
      images
    })

    const markdownById = parseBatchResponse(responseText, images.map((image) => image.id))
    const providerLabel = clients?.name || provider || 'unknown'
    const modelLabel = clients?.vision?.model || model || 'unknown'

    const results = new Map()
    for (const row of rows) {
      const markdown = markdownById.get(String(row.id))
      if (!markdown) {
        continue
      }
      results.set(String(row.id), { markdown, providerLabel, modelLabel })
    }
    return results
  }

  return {
    type: 'llm',
    execution: { maxParallelBatches: Infinity },
    canRun,
    extractBatch
  }
}

const createAppleVisionOcrExtractor = ({
  settings,
  logger = console,
  resolveBinaryPathImpl = resolveAppleVisionOcrBinaryPath,
  runAppleVisionOcrBinaryImpl = runAppleVisionOcrBinary,
  buildMarkdownLayoutFromOcrImpl = buildMarkdownLayoutFromOcr
} = {}) => {
  const config = settings?.stills_markdown_extractor && typeof settings.stills_markdown_extractor === 'object'
    ? settings.stills_markdown_extractor
    : {}

  const level = typeof config.level === 'string' ? config.level : 'accurate'
  const languages = config.languages || ''
  const usesLanguageCorrection = config.noCorrection === true ? false : true
  const minConfidence = typeof config.minConfidence === 'number' ? config.minConfidence : 0.0

  let binaryPathPromise = null
  const resolveBinaryPathOnce = async () => {
    if (!binaryPathPromise) {
      binaryPathPromise = resolveBinaryPathImpl({ logger })
    }
    return binaryPathPromise
  }

  const canRun = async () => {
    const binaryPath = await resolveBinaryPathOnce()
    if (!binaryPath) {
      return {
        ok: false,
        reason: 'missing_ocr_binary',
        message:
          'Apple Vision OCR helper not found. Build it with ./code/desktopapp/scripts/build-apple-vision-ocr.sh (dev) or ship it with the app.'
      }
    }
    return { ok: true }
  }

  const extractBatch = async ({ rows } = {}) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Map()
    }

    const binaryPath = await resolveBinaryPathOnce()
    if (!binaryPath) {
      return new Map()
    }

    const results = new Map()
    for (const row of rows) {
      try {
        const { meta, lines } = await runAppleVisionOcrBinaryImpl({
          binaryPath,
          imagePath: row.image_path,
          level,
          languages,
          usesLanguageCorrection,
          minConfidence,
          emitObservations: false
        })
        const markdown = buildMarkdownLayoutFromOcrImpl({
          imagePath: row.image_path,
          meta,
          lines
        })
        results.set(String(row.id), {
          markdown,
          providerLabel: 'apple_vision_ocr',
          modelLabel: String(level || 'accurate')
        })
      } catch (error) {
        logger.error('Apple Vision OCR failed for still', {
          id: row.id,
          imagePath: row.image_path,
          error
        })
      }
    }

    return results
  }

  return {
    type: 'apple_vision_ocr',
    // OCR is CPU-heavy; keep this bounded so we don't spawn too many helper processes at once.
    execution: { maxParallelBatches: 2 },
    canRun,
    extractBatch
  }
}

const createStillsMarkdownExtractor = (options = {}) => {
  const type = normalizeExtractorType(options?.settings)
  if (type === 'apple_vision_ocr') {
    return createAppleVisionOcrExtractor(options)
  }
  return createLlmVisionExtractor(options)
}

module.exports = {
  createStillsMarkdownExtractor,
  normalizeExtractorType,
  createAppleVisionOcrExtractor,
  createLlmVisionExtractor
}
