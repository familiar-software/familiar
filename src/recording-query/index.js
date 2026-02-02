const path = require('node:path')
const fs = require('node:fs')

const { QUERY_DIR_NAME, SPEEDUP_FACTOR } = require('./constants')
const { toErrorResult } = require('./errors')
const { filterRecordingSessions, estimateRecordingDuration } = require('./session-filter')
const { concatSegments } = require('./concat')
const { speedupVideo } = require('./speedup')
const { processVideoWithGemini } = require('./gemini')
const { cleanupQueryWorkspace } = require('./cleanup')
const { parseDateRange, validateQuestion } = require('./validation')

const estimateRecordingQuery = ({ contextFolderPath, fromDate, toDate, logger = console } = {}) => {
  if (!contextFolderPath || typeof contextFolderPath !== 'string') {
    return toErrorResult('CONTEXT_MISSING', 'Context folder path is required.')
  }

  const rangeResult = parseDateRange({ fromDate, toDate })
  if (!rangeResult.ok) {
    return rangeResult
  }

  const filterResult = estimateRecordingDuration({
    contextFolderPath,
    rangeStartMs: rangeResult.startMs,
    rangeEndMs: rangeResult.endMs,
    logger
  })

  if (!filterResult.ok) {
    return filterResult
  }

  return {
    ok: true,
    totalDurationMs: filterResult.totalDurationMs,
    totalSessions: filterResult.totalSessions,
    totalSegments: filterResult.totalSegments
  }
}

const buildQueryId = () => `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true })
}

const runRecordingQuery = async ({
  contextFolderPath,
  question,
  fromDate,
  toDate,
  apiKey,
  logger = console
} = {}) => {
  const questionValidation = validateQuestion(question)
  if (!questionValidation.ok) {
    return questionValidation
  }

  if (!contextFolderPath || typeof contextFolderPath !== 'string') {
    return toErrorResult('CONTEXT_MISSING', 'Context folder path is required.')
  }

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return toErrorResult('PROVIDER_UNAVAILABLE', 'Gemini API key is required.')
  }

  const rangeResult = parseDateRange({ fromDate, toDate })
  if (!rangeResult.ok) {
    return rangeResult
  }

  let queryDir = null

  try {
    logger.info('Recording query started', { fromDate, toDate })

    const withTiming = async (step, fn) => {
      const start = Date.now()
      const result = await fn()
      const durationMs = Date.now() - start
      if (result && result.ok === false) {
        logger.error('Recording query step failed', { step, durationMs, error: result.error })
      } else {
        logger.info('Recording query step completed', { step, durationMs })
      }
      return result
    }

    const filterResult = await withTiming('filterSessions', async () => filterRecordingSessions({
      contextFolderPath,
      rangeStartMs: rangeResult.startMs,
      rangeEndMs: rangeResult.endMs,
      logger
    }))

    if (!filterResult.ok) {
      return filterResult
    }

    const queryRoot = path.join(filterResult.recordingsRoot, QUERY_DIR_NAME)
    const queryId = buildQueryId()
    queryDir = path.join(queryRoot, queryId)
    ensureDir(queryDir)

    const segmentsListPath = path.join(queryDir, 'segments.txt')
    const combinedPath = path.join(queryDir, 'combined.mp4')
    const speedupPath = path.join(queryDir, 'combined-speedup.mp4')

    const concatResult = await withTiming('concat', async () => concatSegments({
      segments: filterResult.allSegments,
      listPath: segmentsListPath,
      outputPath: combinedPath,
      logger
    }))
    if (!concatResult.ok) {
      return concatResult
    }

    const speedupResult = await withTiming('speedup', async () => speedupVideo({
      inputPath: combinedPath,
      outputPath: speedupPath,
      speedFactor: SPEEDUP_FACTOR,
      logger
    }))
    if (!speedupResult.ok) {
      return speedupResult
    }

    const geminiResult = await withTiming('gemini', async () => processVideoWithGemini({
      videoPath: speedupPath,
      question,
      apiKey,
      logger
    }))
    if (!geminiResult.ok) {
      return geminiResult
    }

    return { ok: true, answerText: geminiResult.answerText }
  } catch (error) {
    logger.error('Recording query failed', { error })
    return toErrorResult('QUERY_FAILED', error?.message || 'Recording query failed.')
  } finally {
    cleanupQueryWorkspace({ queryDir, logger })
  }
}

module.exports = {
  runRecordingQuery,
  estimateRecordingQuery
}
