const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')

const { loadSettings } = require('../settings')
const { createModelProviderClients } = require('../modelProviders')
const { readImageAsBase64, inferMimeType } = require('../extraction/image')
const { createStillsQueue } = require('./stills-queue')
const {
  JIMINY_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../const')

const PROMPT_PATH = path.join(__dirname, 'stills-markdown-prompt.md')
const PROMPT_TEMPLATE = (() => {
  const contents = fsSync.readFileSync(PROMPT_PATH, 'utf-8')
  const trimmed = contents.trim()
  if (!trimmed) {
    throw new Error('Stills markdown prompt file is empty.')
  }
  return contents.trimEnd()
})()

const DEFAULT_BATCH_SIZE = 4
const DEFAULT_MAX_BATCHES_PER_TICK = 10
const DEFAULT_POLL_INTERVAL_MS = 1000
const DEFAULT_REQUEUE_STALE_PROCESSING_AFTER_MS = 60 * 60 * 1000

const isLlmMockEnabled = () => process.env.JIMINY_LLM_MOCK === '1'

const buildBatchPrompt = (basePrompt, imageIds) => {
  const idsLine = imageIds.map((id) => `- ${id}`).join('\n')
  return [
    'Return markdown for each image in the same order as provided.',
    'Do NOT return JSON or wrap in code fences.',
    'Separate each image response with a single line containing exactly ---',
    'Each image response must follow the exact format below.',
    'Keep the frontmatter --- lines inside each response as shown in the template.',
    '',
    basePrompt,
    '',
    'Image ids (in the same order as images are sent):',
    idsLine
  ].join('\n')
}

const splitMarkdownBlocks = (text) => {
  if (typeof text !== 'string') {
    return []
  }
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return []
  }
  const lines = normalized.split('\n')
  const starts = []
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i].trim() === '---' && lines[i + 1].trim().startsWith('format:')) {
      starts.push(i)
    }
  }
  const segments = []
  if (starts.length === 0) {
    const rawSegments = normalized.split(/\n---\n/)
    for (const segment of rawSegments) {
      const trimmed = segment.trim()
      if (trimmed) {
        segments.push(trimmed)
      }
    }
    return segments
  }

  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1] : lines.length
    let chunk = lines.slice(start, end)
    while (chunk.length > 0 && chunk[0].trim() === '') {
      chunk = chunk.slice(1)
    }
    while (chunk.length > 0 && chunk[chunk.length - 1].trim() === '') {
      chunk = chunk.slice(0, -1)
    }
    if (chunk.length > 1 && chunk[chunk.length - 1].trim() === '---') {
      chunk = chunk.slice(0, -1)
    }
    if (chunk.length > 0) {
      segments.push(chunk.join('\n').trim())
    }
  }

  return segments
}

const parseBatchResponse = (responseText, imageIds = []) => {
  const segments = splitMarkdownBlocks(responseText)
  const map = new Map()
  const limit = Math.min(segments.length, imageIds.length)
  for (let i = 0; i < limit; i += 1) {
    const markdown = segments[i]
    if (!markdown) {
      continue
    }
    map.set(String(imageIds[i]), markdown.trim())
  }
  return map
}

const resolveMarkdownPath = (contextFolderPath, imagePath) => {
  const stillsRoot = path.join(contextFolderPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)
  const markdownRoot = path.join(contextFolderPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME)

  const relative = imagePath.startsWith(stillsRoot)
    ? path.relative(stillsRoot, imagePath)
    : path.basename(imagePath)

  const parsed = path.parse(relative)
  return path.join(markdownRoot, parsed.dir, `${parsed.name}.md`)
}

const writeMarkdownFile = async ({ contextFolderPath, imagePath, markdown }) => {
  if (!markdown) {
    throw new Error('Markdown content is required.')
  }
  const outputPath = resolveMarkdownPath(contextFolderPath, imagePath)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  const payload = markdown.endsWith('\n') ? markdown : `${markdown}\n`
  await fs.writeFile(outputPath, payload, 'utf-8')
  return outputPath
}

const extractBatchMarkdown = async ({ provider, apiKey, model, images }) => {
  if (!Array.isArray(images) || images.length === 0) {
    return new Map()
  }

  if (isLlmMockEnabled()) {
    const mockText = process.env.JIMINY_LLM_MOCK_TEXT || 'gibberish'
    return new Map(images.map((image) => [String(image.id), mockText]))
  }

  const prompt = buildBatchPrompt(PROMPT_TEMPLATE, images.map((image) => image.id))
  const clients = createModelProviderClients({ provider, apiKey, visionModel: model })
  const responseText = await clients.vision.extractBatch({
    prompt,
    images
  })
  return parseBatchResponse(responseText, images.map((image) => image.id))
}

const createStillsMarkdownWorker = ({
  logger = console,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxBatchesPerTick = DEFAULT_MAX_BATCHES_PER_TICK,
  requeueProcessingAfterMs = DEFAULT_REQUEUE_STALE_PROCESSING_AFTER_MS,
  runImmediately = true,
  loadSettingsImpl = loadSettings,
  createQueueImpl = createStillsQueue,
  extractBatchMarkdownImpl = extractBatchMarkdown,
  writeMarkdownFileImpl = writeMarkdownFile,
  readImageAsBase64Impl = readImageAsBase64,
  inferMimeTypeImpl = inferMimeType
} = {}) => {
  let running = false
  let contextFolderPath = ''
  let queueStore = null
  let timer = null
  let isProcessing = false

  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    running = false
    if (queueStore && !isProcessing) {
      queueStore.close()
      queueStore = null
    }
  }

  const start = ({ contextFolderPath: nextContextFolderPath } = {}) => {
    if (!nextContextFolderPath) {
      throw new Error('Context folder path required to start stills markdown worker.')
    }
    if (running && contextFolderPath === nextContextFolderPath) {
      return
    }
    stop()
    contextFolderPath = nextContextFolderPath
    queueStore = createQueueImpl({ contextFolderPath, logger })
    running = true
    if (Number.isFinite(pollIntervalMs) && pollIntervalMs > 0) {
      timer = setInterval(() => {
        void processBatch()
      }, pollIntervalMs)
      if (typeof timer.unref === 'function') {
        timer.unref()
      }
    }
    if (runImmediately) {
      void processBatch()
    }
  }

  const resolveMaxBatchesPerTick = () => {
    if (!Number.isFinite(maxBatchesPerTick) || maxBatchesPerTick <= 0) {
      return 1
    }
    return Math.floor(maxBatchesPerTick)
  }

  const processSingleBatch = async ({ batch, batchIndex, provider, apiKey, model }) => {
    try {
      logger.log('Processing stills markdown batch', {
        count: batch.length,
        provider,
        model,
        batchIndex
      })

      const images = await Promise.all(batch.map(async (row) => ({
        id: String(row.id),
        imageBase64: await readImageAsBase64Impl(row.image_path),
        mimeType: inferMimeTypeImpl(row.image_path),
        imagePath: row.image_path
      })))

      const markdownById = await extractBatchMarkdownImpl({
        provider,
        apiKey,
        model,
        images
      })

      logger.log('Received markdown batch response', { count: markdownById.size, batchIndex })

      for (const row of batch) {
        const markdown = markdownById.get(String(row.id))
        if (!markdown) {
          logger.error('Missing markdown response for still', {
            id: row.id,
            imagePath: row.image_path,
            batchIndex
          })
          queueStore.markFailed({ id: row.id, error: 'missing markdown response' })
          continue
        }

        const outputPath = await writeMarkdownFileImpl({
          contextFolderPath,
          imagePath: row.image_path,
          markdown
        })
        queueStore.markDone({
          id: row.id,
          markdownPath: outputPath,
          provider,
          model
        })
        logger.log('Wrote stills markdown', { id: row.id, outputPath })
      }
    } catch (error) {
      logger.error('Stills markdown batch failed', { error, batchIndex })
      for (const row of batch) {
        try {
          queueStore.markFailed({ id: row.id, error: error?.message || error })
        } catch (markError) {
          logger.error('Failed to mark still as failed', { id: row.id, error: markError })
        }
      }
    }
  }

  const processBatch = async () => {
    if (!running || !queueStore || isProcessing) {
      return
    }
    isProcessing = true
    logger.log('Stills markdown worker tick')
    try {
      const requeued = queueStore.requeueStaleProcessing({ olderThanMs: requeueProcessingAfterMs })
      if (requeued > 0) {
        logger.log('Requeued stale stills processing rows', { count: requeued })
      }

      const settings = loadSettingsImpl()
      const provider = settings?.llm_provider?.provider || ''
      const apiKey = settings?.llm_provider?.api_key || ''
      const model = typeof settings?.llm_provider?.vision_model === 'string' &&
        settings.llm_provider.vision_model.trim()
        ? settings.llm_provider.vision_model
        : undefined

      if (!provider) {
        logger.warn('Stills markdown worker paused: missing LLM provider.')
        return
      }
      if (!apiKey && !isLlmMockEnabled()) {
        logger.warn('Stills markdown worker paused: missing LLM API key.')
        return
      }

      const batches = []
      const maxBatches = resolveMaxBatchesPerTick()
      for (let i = 0; i < maxBatches; i += 1) {
        const batch = queueStore.getPendingBatch(DEFAULT_BATCH_SIZE)
        if (batch.length === 0) {
          if (batches.length === 0) {
            logger.log('Stills markdown worker found no pending items')
          }
          break
        }

        const ids = batch.map((row) => row.id)
        queueStore.markProcessing(ids)
        logger.log('Stills markdown worker found pending items', { count: batch.length, batchIndex: i + 1 })
        batches.push({ batch, batchIndex: i + 1 })
      }

      if (batches.length === 0) {
        return
      }

      logger.log('Processing stills markdown batches', {
        count: batches.length,
        provider,
        model
      })
      await Promise.all(
        batches.map(({ batch, batchIndex }) =>
          processSingleBatch({ batch, batchIndex, provider, apiKey, model }))
      )
    } catch (error) {
      logger.error('Stills markdown worker failed', { error })
    } finally {
      isProcessing = false
      if (!running && queueStore) {
        queueStore.close()
        queueStore = null
      }
    }
  }

  return {
    start,
    stop,
    runOnce: processBatch
  }
}

module.exports = {
  buildBatchPrompt,
  parseBatchResponse,
  resolveMarkdownPath,
  writeMarkdownFile,
  createStillsMarkdownWorker
}
