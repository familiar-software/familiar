const fs = require('node:fs/promises')
const path = require('node:path')

const { loadSettings } = require('../settings')
const { scanAndRedactContent } = require('../security/rg-redaction')
const { RetryableError } = require('../utils/retry')
const { createStillsQueue } = require('./stills-queue')
const { createStillsMarkdownExtractor } = require('./stills-markdown-extractor')
const { buildBatchPrompt, parseBatchResponse } = require('./stills-markdown-format')
const { readImageAsBase64, inferMimeType } = require('../utils/image')
const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../const')

const DEFAULT_BATCH_SIZE = 4
const DEFAULT_MAX_BATCHES_PER_TICK = 10
const DEFAULT_POLL_INTERVAL_MS = 1000
const DEFAULT_REQUEUE_STALE_PROCESSING_AFTER_MS = 60 * 60 * 1000
const noop = () => {}

const defaultIsOnlineImpl = async () => {
  // Only meaningful when running inside Electron. In plain Node.js, `require('electron')`
  // typically resolves to a binary path string (no `net` API available).
  try {
    // eslint-disable-next-line global-require
    const electron = require('electron')
    if (electron && typeof electron === 'object' && electron.net && typeof electron.net.isOnline === 'function') {
      return Boolean(electron.net.isOnline())
    }
  } catch (_) {
    // Ignore; fall through.
  }
  return true
}

const resolveMarkdownPath = ({ contextFolderPath, imagePath } = {}) => {
  const stillsRoot = path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)
  const markdownRoot = path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME)

  const relative = imagePath.startsWith(stillsRoot)
    ? path.relative(stillsRoot, imagePath)
    : path.basename(imagePath)

  const parsed = path.parse(relative)
  return path.join(markdownRoot, parsed.dir, `${parsed.name}.md`)
}

const writeMarkdownFile = async ({
  contextFolderPath,
  imagePath,
  markdown,
  scanAndRedactContentImpl = scanAndRedactContent,
  onRedactionWarning = noop
}) => {
  if (!markdown) {
    throw new Error('Markdown content is required.')
  }
  const outputPath = resolveMarkdownPath({ contextFolderPath, imagePath })
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  const payload = markdown.endsWith('\n') ? markdown : `${markdown}\n`
  const redactionResult = await scanAndRedactContentImpl({
    content: payload,
    fileType: 'stills-markdown',
    fileIdentifier: outputPath,
    onRedactionWarning
  })
  if (redactionResult.redactionBypassed) {
    console.warn('Saved still markdown without redaction due to scanner issue', { outputPath })
  } else if (redactionResult.findings > 0) {
    console.log('Redacted still markdown before save', {
      outputPath,
      findings: redactionResult.findings,
      ruleCounts: redactionResult.ruleCounts
    })
  }
  await fs.writeFile(outputPath, redactionResult.content, 'utf-8')
  return outputPath
}

const createStillsMarkdownWorker = ({
  logger = console,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxBatchesPerTick = DEFAULT_MAX_BATCHES_PER_TICK,
  requeueProcessingAfterMs = DEFAULT_REQUEUE_STALE_PROCESSING_AFTER_MS,
  isOnlineImpl = defaultIsOnlineImpl,
  runImmediately = true,
  loadSettingsImpl = loadSettings,
  createQueueImpl = createStillsQueue,
  createExtractorImpl = createStillsMarkdownExtractor,
  writeMarkdownFileImpl = writeMarkdownFile,
  scanAndRedactContentImpl = scanAndRedactContent,
  onRedactionWarning = noop,
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

  const processSingleBatch = async ({ batch, batchIndex, extractor }) => {
    try {
      logger.log('Processing stills markdown batch', {
        count: batch.length,
        extractorType: extractor?.type || 'unknown',
        batchIndex
      })

      const resultsById = await extractor.extractBatch({ rows: batch })

      logger.log('Received markdown batch response', { count: resultsById.size, batchIndex })

      for (const row of batch) {
        const result = resultsById.get(String(row.id))
        const markdown = result?.markdown
        if (typeof markdown !== 'string' || !markdown.trim()) {
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
          markdown,
          scanAndRedactContentImpl,
          onRedactionWarning
        })
        queueStore.markDone({
          id: row.id,
          markdownPath: outputPath,
          provider: result?.providerLabel || null,
          model: result?.modelLabel || null
        })
        logger.log('Wrote stills markdown', { id: row.id, outputPath })
      }
    } catch (error) {
      logger.error('Stills markdown batch failed', { error, batchIndex })
      const retryable = error instanceof RetryableError
      for (const row of batch) {
        try {
          if (retryable && typeof queueStore.markPending === 'function') {
            queueStore.markPending({ id: row.id, error: error?.message || error })
            logger.warn('Requeued still for markdown retry (retryable error)', {
              id: row.id,
              batchIndex,
              status: error?.status
            })
          } else {
            queueStore.markFailed({ id: row.id, error: error?.message || error })
          }
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
      const extractor = createExtractorImpl({
        settings,
        logger,
        isOnlineImpl,
        readImageAsBase64Impl,
        inferMimeTypeImpl
      })

      const canRun = await extractor.canRun({ contextFolderPath })
      if (!canRun?.ok) {
        logger.warn('Stills markdown worker paused', {
          extractorType: extractor?.type || 'unknown',
          reason: canRun?.reason || 'unknown',
          message: canRun?.message || ''
        })
        return
      }

      const batches = []
      const extractorMaxParallel = Number.isFinite(extractor?.execution?.maxParallelBatches)
        ? Math.max(1, Math.floor(extractor.execution.maxParallelBatches))
        : Infinity
      const maxBatches = Math.min(resolveMaxBatchesPerTick(), extractorMaxParallel)
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
        extractorType: extractor?.type || 'unknown'
      })
      if (extractorMaxParallel <= 1) {
        for (const { batch, batchIndex } of batches) {
          // Serial execution for CPU-heavy extractors (OCR).
          // eslint-disable-next-line no-await-in-loop
          await processSingleBatch({ batch, batchIndex, extractor })
        }
      } else {
        await Promise.all(
          batches.map(({ batch, batchIndex }) =>
            processSingleBatch({ batch, batchIndex, extractor }))
        )
      }
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
