const { globalShortcut } = require('electron')

const DEFAULT_RECORDING_HOTKEY = 'CommandOrControl+R'
let recordingHotkey = null

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
  if (recordingHotkey) {
    globalShortcut.unregister(recordingHotkey)
    console.log('Recording hotkey unregistered', { accelerator: recordingHotkey })
    recordingHotkey = null
  }
}

module.exports = {
  DEFAULT_RECORDING_HOTKEY,
  registerRecordingHotkey,
  unregisterGlobalHotkeys
}
