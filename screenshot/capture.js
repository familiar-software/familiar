const { app, BrowserWindow, desktopCapturer, ipcMain, screen, dialog, Notification } = require('electron')
const path = require('node:path')
const { normalizeRect, clampRectToBounds } = require('./capture-utils')
const { getCaptureDirectory, savePngToDirectory } = require('./capture-storage')
const { extractionQueue } = require('../extraction')
const { loadSettings, validateContextFolderPath } = require('../settings')
const { showToast } = require('../toast')

let overlayWindow = null
let overlaySession = null

const getFocusedVisibleWindow = () => {
  if (!BrowserWindow || typeof BrowserWindow.getFocusedWindow !== 'function') {
    return null
  }

  const focused = BrowserWindow.getFocusedWindow()
  if (!focused) {
    return null
  }

  if (typeof focused.isDestroyed === 'function' && focused.isDestroyed()) {
    return null
  }

  if (typeof focused.isVisible === 'function' && !focused.isVisible()) {
    return null
  }

  if (typeof focused.isMinimized === 'function' && focused.isMinimized()) {
    return null
  }

  return focused
}

const showCaptureWarningNotification = ({ title, body }) => {
  try {
    if (!Notification || typeof Notification.isSupported !== 'function' || !Notification.isSupported()) {
      console.warn('Notifications not supported for capture warning', { title })
      return false
    }

    const notification = new Notification({ title, body })
    notification.show()
    console.log('Capture warning notification shown', { title })
    return true
  } catch (error) {
    console.warn('Failed to show capture warning notification', { error, title })
    return false
  }
}

const showContextFolderWarning = async ({ message, detail }) => {
  const parentWindow = getFocusedVisibleWindow()
  if (parentWindow) {
    await dialog.showMessageBox(parentWindow, {
      type: 'warning',
      title: 'Context Folder Required',
      message,
      detail,
      buttons: ['OK']
    })
    console.log('Context folder warning shown', { via: 'dialog' })
    return
  }

  const body = detail ? `${message} ${detail}` : message
  const notified = showCaptureWarningNotification({ title: 'Context Folder Required', body })
  if (!notified) {
    console.warn('Context folder warning suppressed', { reason: 'no_window_no_notification' })
  }
}

function getCaptureDisplay () {
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  console.log('Selected capture display', {
    displayId: display.id,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor
  })
  return display
}

function closeOverlayWindow () {
  if (overlayWindow) {
    overlayWindow.close()
    overlayWindow = null
  }
  overlaySession = null
}

function createOverlayWindow (display, captureDirectory) {
  const bounds = display.bounds
  const captureSize = {
    width: Math.max(1, Math.round(bounds.width * display.scaleFactor)),
    height: Math.max(1, Math.round(bounds.height * display.scaleFactor))
  }

  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  overlaySession = {
    displayId: display.id,
    bounds,
    captureSize,
    captureDirectory
  }

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'), {
    query: { displayId: String(display.id) }
  })
  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show()
    overlayWindow.focus()
  })
  overlayWindow.on('closed', () => {
    overlayWindow = null
    overlaySession = null
    console.log('Capture overlay closed')
  })

  console.log('Capture overlay created', { bounds, displayId: display.id })
}

async function startCaptureFlow () {
  if (overlayWindow) {
    overlayWindow.focus()
    return { ok: true, alreadyOpen: true }
  }

  const settings = loadSettings()
  const contextFolderPath = settings.contextFolderPath || ''
  const validation = validateContextFolderPath(contextFolderPath)
  if (!validation.ok) {
    await showContextFolderWarning({
      message: 'Set a Context Folder Path before capturing.',
      detail: validation.message || 'Open Settings to choose a context folder.'
    })
    return { ok: false, message: validation.message || 'Context folder path is not configured.' }
  }

  const display = getCaptureDisplay()
  const captureDirectory = getCaptureDirectory(validation.path)
  createOverlayWindow(display, captureDirectory)

  return { ok: true }
}

async function handleCaptureGrab (_event, payload) {
  let result = { ok: false, error: 'Capture failed.' }

  if (!overlaySession) {
    result = { ok: false, error: 'Capture session unavailable.' }
    closeOverlayWindow()
    return result
  }

  const rectCss = payload?.rectCss
  if (!rectCss) {
    result = { ok: false, error: 'Selection missing.' }
    closeOverlayWindow()
    return result
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: overlaySession.captureSize || { width: 0, height: 0 }
    })

    if (!Array.isArray(sources) || sources.length === 0) {
      console.error('No screen sources available for capture.')
      result = { ok: false, error: 'No screen sources available.' }
      return result
    }

    const sourcesWithImage = sources.filter(
      (candidate) => candidate.thumbnail && !candidate.thumbnail.isEmpty()
    )
    const source =
      sourcesWithImage.find((candidate) => String(candidate.display_id) === String(overlaySession.displayId)) ||
      sourcesWithImage[0] ||
      sources[0]

    console.log(
      'Capture sources',
      sources.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        displayId: candidate.display_id,
        thumbnailEmpty: candidate.thumbnail?.isEmpty?.(),
        thumbnailSize: candidate.thumbnail?.getSize?.()
      }))
    )

    if (!source || !source.thumbnail) {
      console.error('Failed to resolve capture source.', { displayId: overlaySession.displayId })
      result = { ok: false, error: 'Failed to resolve capture source.' }
      return result
    }

    const image = source.thumbnail
    if (image.isEmpty()) {
      console.warn('Capture source returned empty image. Check permissions.')
      showToast({
        title: 'Permission Required',
        body: 'Screen Recording permission is required to capture screenshots.',
        type: 'warning'
      })
      result = { ok: false, error: 'Capture failed. Check Screen Recording permission.' }
      return result
    }

    const imageSize = image.getSize()
    const normalizedRect = normalizeRect(rectCss)
    if (!normalizedRect) {
      result = { ok: false, error: 'Selection is invalid.' }
      return result
    }

    const viewportWidth = payload?.viewport?.width || overlaySession.bounds.width
    const viewportHeight = payload?.viewport?.height || overlaySession.bounds.height
    const screenOffsetX = payload?.screenOffset?.x ?? overlaySession.bounds.x
    const screenOffsetY = payload?.screenOffset?.y ?? overlaySession.bounds.y
    const offsetX = screenOffsetX - overlaySession.bounds.x
    const offsetY = screenOffsetY - overlaySession.bounds.y
    const adjustedRect = {
      x: normalizedRect.x + offsetX,
      y: normalizedRect.y + offsetY,
      width: normalizedRect.width,
      height: normalizedRect.height
    }
    const scaleX = imageSize.width / Math.max(1, viewportWidth)
    const scaleY = imageSize.height / Math.max(1, viewportHeight)

    if (!Number.isFinite(scaleX) || scaleX <= 0 || !Number.isFinite(scaleY) || scaleY <= 0) {
      console.warn('Invalid scale factors for capture', {
        imageSize,
        bounds: overlaySession.bounds,
        viewport: payload?.viewport,
        screenOffset: payload?.screenOffset,
        offsetX,
        offsetY,
        scaleX,
        scaleY
      })
    }

    const scaledRect = {
      x: Math.round(adjustedRect.x * scaleX),
      y: Math.round(adjustedRect.y * scaleY),
      width: Math.round(adjustedRect.width * scaleX),
      height: Math.round(adjustedRect.height * scaleY)
    }

    const cropRect = clampRectToBounds(scaledRect, imageSize)
    if (!cropRect) {
      console.warn('Selection outside capture bounds', { rectCss, imageSize })
      result = { ok: false, error: 'Selection is outside capture bounds.' }
      return result
    }

    const cropped = image.crop(cropRect)
    const pngBuffer = cropped.toPNG()
    let savedPath = null
    let savedFilename = null

    try {
      if (!overlaySession.captureDirectory) {
        result = { ok: false, error: 'Capture directory is not configured.' }
        return result
      }

      const saveResult = await savePngToDirectory(pngBuffer, overlaySession.captureDirectory)
      savedPath = saveResult.path
      savedFilename = saveResult.filename
      console.log('Capture saved', { path: savedPath })
    } catch (error) {
      console.error('Failed to save capture', error)
      showToast({
        title: 'Capture Failed',
        body: 'Failed to save screenshot. Check write permissions.',
        type: 'error'
      })
      result = { ok: false, error: 'Capture save failed. Check write permissions for capture directory.' }
      return result
    }

    console.log('Capture completed', {
      displayId: overlaySession.displayId,
      rectCss,
      cropRect,
      bytes: pngBuffer.length
    })

    result = {
      ok: true,
      pngBase64: pngBuffer.toString('base64'),
      size: { width: cropRect.width, height: cropRect.height },
      savedPath,
      savedFilename
    }

    showToast({
      title: 'Screenshot Captured',
      body: 'Screenshot saved and queued for analysis.',
      type: 'success'
    })

    void extractionQueue.enqueue({
      sourceType: 'image',
      metadata: { path: savedPath }
    }).catch((error) => {
      console.error('Failed to enqueue extraction event', { error, savedPath })
    })

    return result
  } catch (error) {
    console.error('Capture failed', error)
    showToast({
      title: 'Capture Failed',
      body: 'Screenshot capture failed unexpectedly.',
      type: 'error'
    })
    result = { ok: false, error: 'Capture failed.' }
    return result
  } finally {
    closeOverlayWindow()
  }
}

function registerCaptureHandlers () {
  ipcMain.handle('capture:start', () => startCaptureFlow())
  ipcMain.handle('capture:grab', handleCaptureGrab)
  ipcMain.handle('capture:close', () => {
    closeOverlayWindow()
    return { ok: true }
  })
}

module.exports = {
  registerCaptureHandlers,
  startCaptureFlow,
  closeOverlayWindow
}
