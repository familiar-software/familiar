const { getClipboardMirrorDirectory, saveClipboardMirrorToDirectory } = require('./storage')

const DEFAULT_POLL_INTERVAL_MS = 500

function noop() {}

function createClipboardMirror (options = {}) {
  const logger = options.logger || console
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

  const saveImpl = typeof options.saveImpl === 'function'
    ? options.saveImpl
    : saveClipboardMirrorToDirectory

  let timer = null
  let running = false
  let lastSeenText = null
  let contextFolderPath = ''
  let sessionId = ''

  const stop = (reason = 'stop') => {
    if (timer) {
      scheduler.clearInterval(timer)
      timer = null
    }
    if (running) {
      logger.log('Clipboard mirror stopped', { reason })
    }
    running = false
    lastSeenText = null
    contextFolderPath = ''
    sessionId = ''
  }

  const tick = async () => {
    if (!running) {
      return { ok: true, skipped: true, reason: 'not-running' }
    }

    const text = readTextImpl()
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: true, skipped: true, reason: 'empty' }
    }

    if (text === lastSeenText) {
      return { ok: true, skipped: true, reason: 'unchanged' }
    }

    const directory = getClipboardMirrorDirectory(contextFolderPath, sessionId)
    if (!directory) {
      logger.warn('Clipboard mirror tick skipped: missing directory', { contextFolderPath, sessionId })
      return { ok: false, skipped: true, reason: 'missing-directory' }
    }

    try {
      const { path: savedPath } = await saveImpl(text, directory, new Date())
      lastSeenText = text
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

    contextFolderPath = nextContextFolderPath
    sessionId = nextSessionId

    if (running) {
      return { ok: true, alreadyRunning: true }
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
