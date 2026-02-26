const { createHash } = require('node:crypto')
const { createStillsQueue } = require('../screen-stills/stills-queue')
const {
  getClipboardMirrorDirectory,
  getClipboardImageMirrorDirectory,
  saveClipboardMirrorToDirectory,
  saveClipboardImageMirrorToDirectory
} = require('./storage')

const DEFAULT_POLL_INTERVAL_MS = 500

function noop() {}

function isSingleWordClipboardText(text) {
  if (typeof text !== 'string') {
    return false
  }
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return false
  }
  return trimmed.split(/\s+/).length === 1
}

function createClipboardMirror (options = {}) {
  const logger = options.logger || console
  const onRedactionWarning = typeof options.onRedactionWarning === 'function'
    ? options.onRedactionWarning
    : noop
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) && options.pollIntervalMs > 0
    ? Math.floor(options.pollIntervalMs)
    : DEFAULT_POLL_INTERVAL_MS
  const scheduler = options.scheduler || { setInterval, clearInterval }

  const readTextImpl = typeof options.readTextImpl === 'function'
    ? options.readTextImpl
    : () => {
      try {
        // Only meaningful inside Electron. In plain Node.js, `require('electron')` may fail.
        // eslint-disable-next-line global-require
        const electron = require('electron')
        if (electron && typeof electron === 'object' && electron.clipboard && typeof electron.clipboard.readText === 'function') {
          return electron.clipboard.readText()
        }
      } catch (error) {
        logger.warn('Clipboard mirror read failed', { error: error?.message || error })
      }
      return ''
    }
  const readImageImpl = typeof options.readImageImpl === 'function'
    ? options.readImageImpl
    : () => {
      try {
        // Only meaningful inside Electron. In plain Node.js, `require('electron')` may fail.
        // eslint-disable-next-line global-require
        const electron = require('electron')
        if (electron && typeof electron === 'object' && electron.clipboard && typeof electron.clipboard.readImage === 'function') {
          return electron.clipboard.readImage()
        }
      } catch (error) {
        logger.warn('Clipboard mirror image read failed', { error: error?.message || error })
      }
      return null
    }

  const saveTextImpl = typeof options.saveTextImpl === 'function'
    ? options.saveTextImpl
    : saveClipboardMirrorToDirectory
  const saveImageImpl = typeof options.saveImageImpl === 'function'
    ? options.saveImageImpl
    : saveClipboardImageMirrorToDirectory
  const createQueueImpl = typeof options.createQueueImpl === 'function'
    ? options.createQueueImpl
    : createStillsQueue
  const computeImageSignatureImpl = typeof options.computeImageSignatureImpl === 'function'
    ? options.computeImageSignatureImpl
    : (imageBuffer) => createHash('sha256').update(imageBuffer).digest('hex')

  let timer = null
  let running = false
  let lastProcessedText = null
  let lastProcessedImageSignature = null
  let contextFolderPath = ''
  let sessionId = ''
  let queueStore = null

  const closeQueueStore = () => {
    if (!queueStore || typeof queueStore.close !== 'function') {
      queueStore = null
      return
    }
    try {
      queueStore.close()
    } catch (error) {
      logger.error('Clipboard mirror queue close failed', { error, sessionId })
    } finally {
      queueStore = null
    }
  }

  const openQueueStore = () => {
    queueStore = createQueueImpl({ contextFolderPath, logger })
    logger.log('Clipboard mirror queue opened', { sessionId })
  }

  const readClipboardImage = () => {
    const image = readImageImpl()
    if (!image) {
      return { hasImage: false, reason: 'empty' }
    }
    if (Buffer.isBuffer(image)) {
      return image.length > 0
        ? { hasImage: true, imageBuffer: image, extension: 'png' }
        : { hasImage: false, reason: 'empty' }
    }
    if (typeof image === 'object' && Buffer.isBuffer(image.buffer)) {
      const extension = typeof image.extension === 'string' && image.extension.trim()
        ? image.extension
        : 'png'
      return image.buffer.length > 0
        ? { hasImage: true, imageBuffer: image.buffer, extension }
        : { hasImage: false, reason: 'empty' }
    }
    if (typeof image.isEmpty === 'function' && image.isEmpty()) {
      return { hasImage: false, reason: 'empty' }
    }
    if (typeof image.toPNG === 'function') {
      try {
        const imageBuffer = image.toPNG()
        if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
          return { hasImage: false, reason: 'empty' }
        }
        return { hasImage: true, imageBuffer, extension: 'png' }
      } catch (error) {
        logger.warn('Clipboard mirror image conversion failed', { error, sessionId })
        return { hasImage: true, reason: 'invalid-image' }
      }
    }
    return { hasImage: true, reason: 'invalid-image' }
  }

  const stop = (reason = 'stop') => {
    if (timer) {
      scheduler.clearInterval(timer)
      timer = null
    }
    closeQueueStore()
    if (running) {
      logger.log('Clipboard mirror stopped', { reason })
    }
    running = false
    lastProcessedText = null
    lastProcessedImageSignature = null
    contextFolderPath = ''
    sessionId = ''
  }

  const tick = async () => {
    if (!running) {
      return { ok: true, skipped: true, reason: 'not-running' }
    }

    const clipboardImage = readClipboardImage()
    if (clipboardImage.hasImage) {
      if (!clipboardImage.imageBuffer) {
        logger.warn('Clipboard mirror image skipped: invalid image', { sessionId })
        return { ok: true, skipped: true, reason: clipboardImage.reason || 'invalid-image' }
      }

      const imageSignature = computeImageSignatureImpl(clipboardImage.imageBuffer)
      if (imageSignature === lastProcessedImageSignature) {
        logger.log('Clipboard mirror image skipped: unchanged', { sessionId })
        return { ok: true, skipped: true, reason: 'unchanged-image' }
      }

      const imageDirectory = getClipboardImageMirrorDirectory({
        contextFolderPath,
        sessionId
      })
      if (!imageDirectory) {
        logger.warn('Clipboard mirror image tick skipped: missing directory', { contextFolderPath, sessionId })
        return { ok: false, skipped: true, reason: 'missing-image-directory' }
      }
      if (!queueStore || typeof queueStore.enqueueCapture !== 'function') {
        logger.warn('Clipboard mirror image tick skipped: queue unavailable', { sessionId })
        return { ok: false, skipped: true, reason: 'missing-queue' }
      }

      try {
        const savedImage = await saveImageImpl({
          imageBuffer: clipboardImage.imageBuffer,
          directory: imageDirectory,
          options: { date: new Date(), extension: clipboardImage.extension || 'png' }
        })
        queueStore.enqueueCapture({
          imagePath: savedImage.path,
          sessionId,
          capturedAt: savedImage.capturedAt
        })
        lastProcessedImageSignature = imageSignature
        logger.log('Clipboard image mirrored and enqueued', {
          path: savedImage.path,
          sessionId
        })
        return { ok: true, path: savedImage.path, type: 'image' }
      } catch (error) {
        logger.error('Clipboard image mirror write failed', { error, sessionId })
        return { ok: false, reason: 'image-write-failed', error }
      }
    }

    if (clipboardImage.reason === 'invalid-image') {
      logger.warn('Clipboard mirror image skipped: invalid image', { sessionId })
      return { ok: true, skipped: true, reason: 'invalid-image' }
    }

    const text = readTextImpl()
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: true, skipped: true, reason: 'empty' }
    }

    if (text === lastProcessedText) {
      return { ok: true, skipped: true, reason: 'unchanged' }
    }

    if (isSingleWordClipboardText(text)) {
      lastProcessedText = text
      logger.log('Clipboard mirror skipped: single-word text', { sessionId })
      return { ok: true, skipped: true, reason: 'single-word' }
    }

    const directory = getClipboardMirrorDirectory({
      contextFolderPath,
      sessionId
    })
    if (!directory) {
      logger.warn('Clipboard mirror tick skipped: missing directory', { contextFolderPath, sessionId })
      return { ok: false, skipped: true, reason: 'missing-directory' }
    }

    try {
      const { path: savedPath } = await saveTextImpl({
        text,
        directory,
        date: new Date(),
        options: {
          onRedactionWarning
        }
      })
      lastProcessedText = text
      logger.log('Clipboard mirrored', { path: savedPath, sessionId })
      return { ok: true, path: savedPath }
    } catch (error) {
      logger.error('Clipboard mirror write failed', { error, sessionId })
      return { ok: false, reason: 'write-failed', error }
    }
  }

  const start = ({ contextFolderPath: nextContextFolderPath, sessionId: nextSessionId } = {}) => {
    if (typeof nextContextFolderPath !== 'string' || nextContextFolderPath.trim().length === 0) {
      logger.warn('Clipboard mirror start skipped: missing context folder path')
      stop('invalid-context')
      return { ok: false, reason: 'missing-context-folder' }
    }
    if (typeof nextSessionId !== 'string' || nextSessionId.trim().length === 0) {
      logger.warn('Clipboard mirror start skipped: missing session id')
      stop('missing-session-id')
      return { ok: false, reason: 'missing-session-id' }
    }

    // Restart idempotently if already running for a different session.
    if (running && (contextFolderPath !== nextContextFolderPath || sessionId !== nextSessionId)) {
      stop('restart')
    }
    if (running) {
      return { ok: true, alreadyRunning: true }
    }

    contextFolderPath = nextContextFolderPath
    sessionId = nextSessionId
    try {
      openQueueStore()
    } catch (error) {
      logger.error('Clipboard mirror queue init failed', { error, sessionId })
      stop('queue-init-failed')
      return { ok: false, reason: 'queue-init-failed' }
    }

    running = true
    timer = scheduler.setInterval(() => {
      void tick().catch((error) => {
        logger.error('Clipboard mirror tick failed', { error })
      })
    }, pollIntervalMs)
    if (timer && typeof timer.unref === 'function') {
      timer.unref()
    }

    logger.log('Clipboard mirror started', { pollIntervalMs, sessionId })
    return { ok: true }
  }

  return {
    start,
    stop,
    tick,
    getState: () => ({
      running,
      pollIntervalMs,
      contextFolderPath,
      sessionId
    })
  }
}

module.exports = {
  DEFAULT_POLL_INTERVAL_MS,
  createClipboardMirror
}
