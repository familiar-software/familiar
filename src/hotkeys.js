const { globalShortcut } = require('electron')

const DEFAULT_CAPTURE_HOTKEY = 'CommandOrControl+Shift+J'
const DEFAULT_CLIPBOARD_HOTKEY = 'CommandOrControl+J'
const DEFAULT_RECORDING_HOTKEY = 'CommandOrControl+R'
let captureHotkey = null
let clipboardHotkey = null
let recordingHotkey = null

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

function registerClipboardHotkey ({ onClipboard, accelerator = DEFAULT_CLIPBOARD_HOTKEY } = {}) {
  if (typeof onClipboard !== 'function') {
    console.warn('Clipboard hotkey registration skipped: missing handler')
    return { ok: false, reason: 'missing-handler' }
  }

  if (!accelerator) {
    console.log('Clipboard hotkey disabled (empty accelerator)')
    return { ok: false, reason: 'disabled' }
  }

  const success = globalShortcut.register(accelerator, () => {
    console.log('Clipboard hotkey triggered', { accelerator })
    try {
      onClipboard()
    } catch (error) {
      console.error('Clipboard hotkey handler failed', error)
    }
  })

  if (!success) {
    console.warn('Clipboard hotkey registration failed', { accelerator })
    return { ok: false, accelerator, reason: 'registration-failed' }
  }

  clipboardHotkey = accelerator
  console.log('Clipboard hotkey registered', { accelerator })
  return { ok: true, accelerator }
}

function registerRecordingHotkey ({ onRecording, accelerator = DEFAULT_RECORDING_HOTKEY } = {}) {
  if (typeof onRecording !== 'function') {
    console.warn('Recording hotkey registration skipped: missing handler')
    return { ok: false, reason: 'missing-handler' }
  }

  if (!accelerator) {
    console.log('Recording hotkey disabled (empty accelerator)')
    return { ok: false, reason: 'disabled' }
  }

  const success = globalShortcut.register(accelerator, () => {
    console.log('Recording hotkey triggered', { accelerator })
    try {
      onRecording()
    } catch (error) {
      console.error('Recording hotkey handler failed', error)
    }
  })

  if (!success) {
    console.warn('Recording hotkey registration failed', { accelerator })
    return { ok: false, accelerator, reason: 'registration-failed' }
  }

  recordingHotkey = accelerator
  console.log('Recording hotkey registered', { accelerator })
  return { ok: true, accelerator }
}

function unregisterGlobalHotkeys () {
  if (captureHotkey) {
    globalShortcut.unregister(captureHotkey)
    console.log('Capture hotkey unregistered', { accelerator: captureHotkey })
    captureHotkey = null
  }

  if (clipboardHotkey) {
    globalShortcut.unregister(clipboardHotkey)
    console.log('Clipboard hotkey unregistered', { accelerator: clipboardHotkey })
    clipboardHotkey = null
  }

  if (recordingHotkey) {
    globalShortcut.unregister(recordingHotkey)
    console.log('Recording hotkey unregistered', { accelerator: recordingHotkey })
    recordingHotkey = null
  }
}

module.exports = {
  DEFAULT_CAPTURE_HOTKEY,
  DEFAULT_CLIPBOARD_HOTKEY,
  DEFAULT_RECORDING_HOTKEY,
  registerCaptureHotkey,
  registerClipboardHotkey,
  registerRecordingHotkey,
  unregisterGlobalHotkeys
}
