const { globalShortcut } = require('electron')

const DEFAULT_CAPTURE_HOTKEY = 'CommandOrControl+Shift+J'
let captureHotkey = null

function registerCaptureHotkey ({ onCapture, accelerator = DEFAULT_CAPTURE_HOTKEY } = {}) {
  if (typeof onCapture !== 'function') {
    console.warn('Capture hotkey registration skipped: missing handler')
    return { ok: false, reason: 'missing-handler' }
  }

  if (!accelerator) {
    console.log('Capture hotkey disabled (empty accelerator)')
    return { ok: false, reason: 'disabled' }
  }

  const success = globalShortcut.register(accelerator, () => {
    console.log('Capture hotkey triggered', { accelerator })
    try {
      onCapture()
    } catch (error) {
      console.error('Capture hotkey handler failed', error)
    }
  })

  if (!success) {
    console.warn('Capture hotkey registration failed', { accelerator })
    return { ok: false, accelerator, reason: 'registration-failed' }
  }

  captureHotkey = accelerator
  console.log('Capture hotkey registered', { accelerator })
  return { ok: true, accelerator }
}

function unregisterGlobalHotkeys () {
  if (!captureHotkey) {
    return
  }

  globalShortcut.unregister(captureHotkey)
  console.log('Capture hotkey unregistered', { accelerator: captureHotkey })
  captureHotkey = null
}

module.exports = {
  DEFAULT_CAPTURE_HOTKEY,
  registerCaptureHotkey,
  unregisterGlobalHotkeys
}
