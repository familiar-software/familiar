const { BrowserWindow, screen, ipcMain, shell } = require('electron')
const path = require('path')

let toastWindow = null
let hideTimeout = null

const TOAST_COMPACT_WIDTH = 320
const TOAST_COMPACT_HEIGHT = 70
const TOAST_LARGE_WIDTH = 420
const TOAST_LARGE_HEIGHT = 120
const TOAST_MARGIN = 16
const TOAST_DURATION_MS = 3000

const SIZES = {
  compact: { width: TOAST_COMPACT_WIDTH, height: TOAST_COMPACT_HEIGHT },
  large: { width: TOAST_LARGE_WIDTH, height: TOAST_LARGE_HEIGHT }
}

/**
 * Show a toast notification
 * @param {Object} options
 * @param {string} options.title - Toast title
 * @param {string} options.body - Toast body text
 * @param {'success' | 'error' | 'warning' | 'info'} [options.type='info'] - Toast type for icon
 * @param {'compact' | 'large'} [options.size='compact'] - Toast size variant
 * @param {number} [options.duration=3000] - Duration in ms before auto-hide
 * @param {Array<{label: string, action: string, data?: any}>} [options.actions=[]] - Action buttons
 */
function showToast ({ title, body, type = 'info', size = 'compact', duration = TOAST_DURATION_MS, actions = [] } = {}) {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }

  const { width } = SIZES[size] || SIZES.compact

  // Start with a safe height so nothing is clipped before we measure.
  // We'll shrink it to exact content height after render.
  const INITIAL_HEIGHT = 260

  const primaryDisplay = screen.getPrimaryDisplay()
  const { workArea } = primaryDisplay
  const x = workArea.x + workArea.width - width - TOAST_MARGIN
  const y = workArea.y + TOAST_MARGIN

  // If a window exists but width changed, recreate.
  if (toastWindow && !toastWindow.isDestroyed()) {
    const [currentWidth] = toastWindow.getSize()
    if (currentWidth !== width) {
      toastWindow.destroy()
      toastWindow = null
    }
  }

  const sendDataAndAutosize = async () => {
    if (!toastWindow || toastWindow.isDestroyed()) return

    toastWindow.webContents.send('toast-data', { title, body, type, size, actions, duration })

    // Wait for the renderer to apply DOM changes, then measure actual height in the page
    try {
      const measuredHeight = await toastWindow.webContents.executeJavaScript(`
        new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const el = document.getElementById('toast') || document.body;
              const h = Math.max(
                el?.getBoundingClientRect?.().height || 0,
                document.documentElement.scrollHeight,
                document.body.scrollHeight
              );
              resolve(Math.ceil(h));
            });
          });
        })
      `)

      // Clamp so huge bodies don't make a giant overlay
      const clampedHeight = Math.max(60, Math.min(320, Number(measuredHeight) || INITIAL_HEIGHT))

      const display = screen.getDisplayMatching(toastWindow.getBounds())
      const wa = display.workArea

      toastWindow.setBounds(
        {
          width,
          height: clampedHeight,
          x: wa.x + wa.width - width - TOAST_MARGIN,
          y: wa.y + TOAST_MARGIN
        },
        false
      )
    } catch (e) {
      // If measurement fails, just keep initial height.
      // (This avoids breaking toast completely.)
      console.warn('Toast autosize failed', { error: e })
    }
  }

  if (toastWindow && !toastWindow.isDestroyed()) {
    // Reuse
    toastWindow.setBounds({ width, height: INITIAL_HEIGHT, x, y }, false)
    toastWindow.showInactive()
    void sendDataAndAutosize()
  } else {
    toastWindow = new BrowserWindow({
      width,
      height: INITIAL_HEIGHT,
      x,
      y,
      useContentSize: true,          // IMPORTANT: sizes refer to content area
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })

    toastWindow.loadFile(path.join(__dirname, 'toast.html'))

    toastWindow.once('ready-to-show', () => {
      toastWindow.showInactive()
      void sendDataAndAutosize()
    })

    toastWindow.on('closed', () => {
      toastWindow = null
    })
  }

  hideTimeout = setTimeout(() => {
    if (toastWindow && !toastWindow.isDestroyed()) toastWindow.hide()
    hideTimeout = null
  }, duration)
}



/**
 * Hide the toast immediately
 */
function hideToast () {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  if (toastWindow && !toastWindow.isDestroyed()) {
    toastWindow.hide()
  }
}

/**
 * Destroy the toast window
 */
function destroyToast () {
  hideToast()
  if (toastWindow && !toastWindow.isDestroyed()) {
    toastWindow.destroy()
    toastWindow = null
  }
}

if (ipcMain && typeof ipcMain.on === 'function') {
  ipcMain.on('toast-close', () => {
    hideToast()
  })

  ipcMain.on('toast-action', (_event, { action, data }) => {
    if (action === 'open-in-folder' && data) {
      shell.showItemInFolder(data)
      hideToast()
    }
  })
}

module.exports = {
  showToast,
  hideToast,
  destroyToast
}
