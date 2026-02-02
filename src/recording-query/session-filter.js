const fs = require('node:fs')
const path = require('node:path')

const { JIMINY_BEHIND_THE_SCENES_DIR_NAME, RECORDINGS_DIR_NAME } = require('../const')
const { toErrorResult } = require('./errors')

const getRecordingsRoot = (contextFolderPath) =>
  path.join(contextFolderPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, RECORDINGS_DIR_NAME)

const safeParseDate = (value) => {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

const readManifest = (manifestPath, logger) => {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    if (!raw.trim()) {
      logger?.warn?.('Recording manifest is empty', { manifestPath })
      return null
    }
    return JSON.parse(raw)
  } catch (error) {
    logger?.warn?.('Failed to read recording manifest', { manifestPath, error })
    return null
  }
}

const resolveFallbackEnd = (manifest, logger, manifestPath) => {
  const segments = Array.isArray(manifest?.segments) ? manifest.segments : []
  if (segments.length === 0) {
    return null
  }
  const sorted = segments
    .slice()
    .sort((a, b) => {
      const indexA = Number(a?.index)
      const indexB = Number(b?.index)
      if (Number.isFinite(indexA) && Number.isFinite(indexB)) {
        return indexA - indexB
      }
      return 0
    })
  const last = sorted[sorted.length - 1]
  const endedAt = safeParseDate(last?.endedAt)
  if (!endedAt) {
    logger?.warn?.('Recording manifest missing endedAt in last segment', { manifestPath })
  }
  return endedAt
}

const buildSegmentsFromManifest = ({ manifest, sessionDir, logger }) => {
  if (!Array.isArray(manifest?.segments) || manifest.segments.length === 0) {
    return null
  }

  const sorted = manifest.segments.slice().sort((a, b) => {
    const indexA = Number(a?.index)
    const indexB = Number(b?.index)
    if (Number.isFinite(indexA) && Number.isFinite(indexB)) {
      return indexA - indexB
    }
    return 0
  })

  const segments = []
  sorted.forEach((segment) => {
    const fileName = segment?.file
    if (!fileName || typeof fileName !== 'string') {
      logger?.warn?.('Recording segment missing file name', { sessionDir, segment })
      return
    }
    const segmentPath = path.join(sessionDir, fileName)
    if (!fs.existsSync(segmentPath)) {
      logger?.warn?.('Recording segment file missing', { sessionDir, segmentPath })
      return
    }
    segments.push(segmentPath)
  })

  return segments
}

const buildSegmentsFromDisk = ({ sessionDir, logger }) => {
  let entries = []
  try {
    entries = fs.readdirSync(sessionDir, { withFileTypes: true })
  } catch (error) {
    logger?.warn?.('Failed to read session directory for segments', { sessionDir, error })
    return []
  }

  const segments = entries
    .filter((entry) => entry.isFile() && /^segment-\d+\.mp4$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((fileName) => path.join(sessionDir, fileName))

  segments.forEach((segmentPath) => {
    if (!fs.existsSync(segmentPath)) {
      logger?.warn?.('Recording segment file missing', { sessionDir, segmentPath })
    }
  })

  return segments.filter((segmentPath) => fs.existsSync(segmentPath))
}

const filterRecordingSessions = ({ contextFolderPath, rangeStartMs, rangeEndMs, logger = console }) => {
  if (!contextFolderPath) {
    return toErrorResult('CONTEXT_MISSING', 'Context folder path is required.')
  }

  const recordingsRoot = getRecordingsRoot(contextFolderPath)
  if (!fs.existsSync(recordingsRoot)) {
    logger.warn('Recordings root missing', { recordingsRoot })
    return toErrorResult('NO_SESSIONS', 'No recordings available for the selected range.')
  }

  const entries = fs.readdirSync(recordingsRoot, { withFileTypes: true })
  const sessions = []
  let matchedSessions = 0
  let matchedSegments = 0
  let totalDurationMs = 0

  entries.filter((entry) => entry.isDirectory()).forEach((entry) => {
    const sessionDir = path.join(recordingsRoot, entry.name)
    const manifestPath = path.join(sessionDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      logger.warn('Recording session missing manifest', { sessionDir })
      return
    }

    const manifest = readManifest(manifestPath, logger)
    if (!manifest) {
      return
    }

    const startedAtMs = safeParseDate(manifest.startedAt)
    if (!startedAtMs) {
      logger.warn('Recording manifest missing startedAt', { manifestPath })
      return
    }

    let endedAtMs = safeParseDate(manifest.endedAt)
    if (!endedAtMs) {
      endedAtMs = resolveFallbackEnd(manifest, logger, manifestPath)
    }
    if (!endedAtMs) {
      endedAtMs = startedAtMs
    }

    if (endedAtMs < startedAtMs) {
      logger.warn('Recording session endedAt before startedAt; using startedAt', {
        manifestPath,
        startedAtMs,
        endedAtMs
      })
      endedAtMs = startedAtMs
    }

    if (startedAtMs > rangeEndMs || endedAtMs < rangeStartMs) {
      return
    }

    matchedSessions += 1

    let segments = buildSegmentsFromManifest({ manifest, sessionDir, logger })
    if (!segments || segments.length === 0) {
      segments = buildSegmentsFromDisk({ sessionDir, logger })
    }

    if (!segments || segments.length === 0) {
      logger.warn('Recording session has no usable segments', { sessionDir })
      return
    }

    const includedFiles = new Set(segments.map((segmentPath) => path.basename(segmentPath)))
    const manifestSegments = Array.isArray(manifest?.segments) ? manifest.segments : []
    const sessionDurationMs = manifestSegments.reduce((acc, segment) => {
      const fileName = segment?.file
      if (!fileName || !includedFiles.has(fileName)) {
        return acc
      }

      const durationMs = Number(segment?.durationMs)
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        logger.warn('Recording segment missing durationMs', { sessionDir, fileName })
        return acc
      }

      const segmentStartMs = safeParseDate(segment?.startedAt)
      const segmentEndMs = safeParseDate(segment?.endedAt)
      if (!segmentStartMs || !segmentEndMs) {
        logger.warn('Recording segment missing timestamps', { sessionDir, fileName })
        return acc
      }
      if (segmentEndMs < segmentStartMs) {
        logger.warn('Recording segment endedAt before startedAt', { sessionDir, fileName })
        return acc
      }

      if (segmentStartMs > rangeEndMs || segmentEndMs < rangeStartMs) {
        return acc
      }

      return acc + durationMs
    }, 0)

    totalDurationMs += sessionDurationMs
    matchedSegments += segments.length
    sessions.push({
      sessionDir,
      manifest,
      segments,
      startedAtMs,
      durationMs: sessionDurationMs
    })
  })

  if (matchedSessions === 0) {
    return toErrorResult('NO_SESSIONS', 'No recordings available for the selected range.')
  }

  if (matchedSegments === 0) {
    return toErrorResult('NO_SEGMENTS', 'No recording segments found for the selected range.')
  }

  sessions.sort((a, b) => a.startedAtMs - b.startedAtMs)

  const allSegments = sessions.reduce((acc, session) => acc.concat(session.segments), [])

  return {
    ok: true,
    recordingsRoot,
    sessions,
    allSegments,
    totalDurationMs,
    totalSessions: sessions.length,
    totalSegments: allSegments.length
  }
}

const estimateRecordingDuration = ({ contextFolderPath, rangeStartMs, rangeEndMs, logger = console }) => {
  if (!contextFolderPath) {
    return toErrorResult('CONTEXT_MISSING', 'Context folder path is required.')
  }

  const recordingsRoot = getRecordingsRoot(contextFolderPath)
  if (!fs.existsSync(recordingsRoot)) {
    logger.warn('Recordings root missing', { recordingsRoot })
    return toErrorResult('NO_SESSIONS', 'No recordings available for the selected range.')
  }

  const entries = fs.readdirSync(recordingsRoot, { withFileTypes: true })
  let totalDurationMs = 0
  let totalSessions = 0
  let totalSegments = 0

  entries.filter((entry) => entry.isDirectory()).forEach((entry) => {
    const sessionDir = path.join(recordingsRoot, entry.name)
    const manifestPath = path.join(sessionDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      logger.warn('Recording session missing manifest', { sessionDir })
      return
    }

    const manifest = readManifest(manifestPath, logger)
    if (!manifest) {
      return
    }

    const startedAtMs = safeParseDate(manifest.startedAt)
    if (!startedAtMs) {
      logger.warn('Recording manifest missing startedAt', { manifestPath })
      return
    }

    let endedAtMs = safeParseDate(manifest.endedAt)
    if (!endedAtMs) {
      endedAtMs = resolveFallbackEnd(manifest, logger, manifestPath)
    }
    if (!endedAtMs) {
      endedAtMs = startedAtMs
    }

    if (endedAtMs < startedAtMs) {
      logger.warn('Recording session endedAt before startedAt; using startedAt', {
        manifestPath,
        startedAtMs,
        endedAtMs
      })
      endedAtMs = startedAtMs
    }

    if (startedAtMs > rangeEndMs || endedAtMs < rangeStartMs) {
      return
    }

    totalSessions += 1

    const segments = Array.isArray(manifest?.segments) ? manifest.segments : []
    if (segments.length === 0) {
      return
    }

    segments.forEach((segment) => {
      const durationMs = Number(segment?.durationMs)
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        logger.warn('Recording segment missing durationMs', { sessionDir, segment })
        return
      }

      const segmentStartMs = safeParseDate(segment?.startedAt)
      const segmentEndMs = safeParseDate(segment?.endedAt)
      if (!segmentStartMs || !segmentEndMs) {
        logger.warn('Recording segment missing timestamps', { sessionDir, segment })
        return
      }
      if (segmentEndMs < segmentStartMs) {
        logger.warn('Recording segment endedAt before startedAt', { sessionDir, segment })
        return
      }

      if (segmentStartMs > rangeEndMs || segmentEndMs < rangeStartMs) {
        return
      }

      const fileName = segment?.file
      if (fileName && typeof fileName === 'string') {
        const segmentPath = path.join(sessionDir, fileName)
        if (!fs.existsSync(segmentPath)) {
          logger.warn('Recording segment file missing', { sessionDir, segmentPath })
          return
        }
      } else {
        logger.warn('Recording segment missing file name', { sessionDir, segment })
        return
      }

      totalDurationMs += durationMs
      totalSegments += 1
    })
  })

  if (totalSessions === 0) {
    return toErrorResult('NO_SESSIONS', 'No recordings available for the selected range.')
  }

  return {
    ok: true,
    recordingsRoot,
    totalDurationMs,
    totalSessions,
    totalSegments
  }
}

module.exports = {
  getRecordingsRoot,
  filterRecordingSessions,
  estimateRecordingDuration,
  safeParseDate
}
