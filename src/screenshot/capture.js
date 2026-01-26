const { app, BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const { normalizeRect, clampRectToBounds } = require('./capture-utils')
const { getCaptureDirectory, savePngToDirectory } = require('./capture-storage')
const { extractionQueue } = require('../extraction')
const { loadSettings, validateContextFolderPath } = require('../settings')
const { showToast } = require('../toast')
const { recordEvent } = require('../history')

let overlayWindow = null
let overlaySession = null

const showContextFolderWarning = async ({ message, detail }) => {
  const body = detail ? `${message} ${detail}` : message
  showToast({
    title: 'Context Folder Required',
    body,
    type: 'warning',
    size: 'large'
  })
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

function createOverlayWindow (display, captureDirectory, contextFolderPath, flowId) {
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
    captureDirectory,
    contextFolderPath,
    flowId
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
  const flowId = randomUUID()
  recordEvent({
    contextFolderPath: validation.path,
    flowId,
    trigger: 'capture_selection',
    step: 'capture',
    status: 'started',
    summary: 'Screen Capture started'
  })
  createOverlayWindow(display, captureDirectory, validation.path, flowId)

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
  const flowId = overlaySession.flowId
  if (!flowId) {
    console.error('Capture flow missing flow_id', { overlaySession })
    closeOverlayWindow()
    throw new Error('Capture flow missing flow_id.')
  }
  const contextFolderPath = overlaySession.contextFolderPath || ''
  const logCaptureEvent = ({ status, summary, detail, outputPath, errorMessage }) => {
    recordEvent({
      contextFolderPath,
      flowId,
      trigger: 'capture_selection',
      step: 'capture',
      status,
      summary,
      detail,
      outputPath,
      errorMessage
    })
  }
  if (!rectCss) {
    result = { ok: false, error: 'Selection missing.' }
    logCaptureEvent({
      status: 'failed',
      summary: 'Capture failed',
      detail: 'Selection missing.'
    })
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
      logCaptureEvent({
        status: 'failed',
        summary: 'Capture failed',
        detail: 'No screen sources available.'
      })
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
      logCaptureEvent({
        status: 'failed',
        summary: 'Capture failed',
        detail: 'Failed to resolve capture source.'
      })
      return result
    }

    const image = source.thumbnail
    if (image.isEmpty()) {
      console.warn('Capture source returned empty image. Check permissions.')
      showToast({
        title: 'Permission Required',
        body: 'Screen Recording failed, try again or check permissions.',
        type: 'warning'
      })
      result = { ok: false, error: 'Screen Recording failed, try again or check permissions.' }
      logCaptureEvent({
        status: 'failed',
        summary: 'Capture failed',
        detail: 'Screen Recording failed, try again or check permissions.'
      })
      return result
    }

    const imageSize = image.getSize()
    const normalizedRect = normalizeRect(rectCss)
    if (!normalizedRect) {
      result = { ok: false, error: 'Selection is invalid.' }
      logCaptureEvent({
        status: 'failed',
        summary: 'Capture failed',
        detail: 'Selection is invalid.'
      })
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
      logCaptureEvent({
        status: 'failed',
        summary: 'Capture failed',
        detail: 'Selection is outside capture bounds.'
      })
      return result
    }

    const cropped = image.crop(cropRect)
    const pngBuffer = cropped.toPNG()
    let savedPath = null
    let savedFilename = null

    try {
      if (!overlaySession.captureDirectory) {
        result = { ok: false, error: 'Capture directory is not configured.' }
        logCaptureEvent({
          status: 'failed',
          summary: 'Capture failed',
          detail: 'Capture directory is not configured.'
        })
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
      logCaptureEvent({
        status: 'failed',
        summary: 'Capture failed',
        detail: 'Failed to save screenshot.',
        errorMessage: error?.message
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

    logCaptureEvent({
      status: 'success',
      summary: 'Screenshot captured',
      outputPath: savedPath
    })

    showToast({
      title: 'Screenshot Captured',
      body: 'Screenshot saved and queued for analysis.',
      type: 'success'
    })

    void extractionQueue.enqueue({
      sourceType: 'image',
      metadata: { path: savedPath },
      flow_id: flowId,
      trigger: 'capture_selection'
    }).catch((error) => {
      console.error('Failed to enqueue extraction event', { error, savedPath })
      showToast({
        title: 'Screenshot Captured (Not Queued)',
        body: 'Screenshot saved, but analysis could not be queued. Try again.',
        type: 'warning'
      })
    })

    return result
  } catch (error) {
    console.error('Capture failed', error)
    showToast({
      title: 'Capture Failed',
      body: 'Screenshot capture failed unexpectedly.',
      type: 'error'
    })
    logCaptureEvent({
      status: 'failed',
      summary: 'Capture failed',
      detail: 'Capture failed unexpectedly.',
      errorMessage: error?.message
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
