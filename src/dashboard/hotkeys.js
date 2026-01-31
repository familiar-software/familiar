(function (global) {
  const createHotkeys = (options = {}) => {
    const elements = options.elements || {}
    const jiminy = options.jiminy || {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : () => {}
    const updateWizardUI = typeof options.updateWizardUI === 'function' ? options.updateWizardUI : () => {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})
    const setHotkeyValue = typeof options.setHotkeyValue === 'function' ? options.setHotkeyValue : () => {}
    const defaults = options.defaults || {}

    const {
      hotkeyButtons = [],
      captureHotkeyButtons = [],
      clipboardHotkeyButtons = [],
      recordingHotkeyButtons = [],
      hotkeysSaveButtons = [],
      hotkeysResetButtons = [],
      hotkeysStatuses = [],
      hotkeysErrors = []
    } = elements

    const DEFAULT_CAPTURE_HOTKEY = defaults.capture || ''
    const DEFAULT_CLIPBOARD_HOTKEY = defaults.clipboard || ''
    const DEFAULT_RECORDING_HOTKEY = defaults.recording || ''

    let recordingElement = null

    const keyEventToAccelerator = (event) => {
      const parts = []

      if (event.metaKey || event.ctrlKey) {
        parts.push('CommandOrControl')
      }
      if (event.altKey) {
        parts.push('Alt')
      }
      if (event.shiftKey) {
        parts.push('Shift')
      }

      const keyFromCode = (code) => {
        if (typeof code !== 'string' || code.length === 0) {
          return null
        }

        if (code.startsWith('Key') && code.length === 4) {
          return code.slice(3)
        }
        if (code.startsWith('Digit') && code.length === 6) {
          return code.slice(5)
        }
        if (code.startsWith('Numpad')) {
          const numpadKey = code.slice(6)
          if (/^\d$/.test(numpadKey)) {
            return numpadKey
          }
        }

        const codeMap = {
          Minus: '-',
          Equal: '=',
          BracketLeft: '[',
          BracketRight: ']',
          Backslash: '\\',
          Semicolon: ';',
          Quote: "'",
          Comma: ',',
          Period: '.',
          Slash: '/',
          Backquote: '`'
        }

        return codeMap[code] || null
      }

      const isSingleAscii = (value) =>
        typeof value === 'string' &&
        value.length === 1 &&
        value.charCodeAt(0) >= 32 &&
        value.charCodeAt(0) <= 126

      let key = event.key

      if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) {
        return null
      }

      const keyMap = {
        ' ': 'Space',
        'ArrowUp': 'Up',
        'ArrowDown': 'Down',
        'ArrowLeft': 'Left',
        'ArrowRight': 'Right',
        'Escape': 'Escape',
        'Enter': 'Return',
        'Backspace': 'Backspace',
        'Delete': 'Delete',
        'Tab': 'Tab',
        'Home': 'Home',
        'End': 'End',
        'PageUp': 'PageUp',
        'PageDown': 'PageDown',
        'Insert': 'Insert'
      }

      if (keyMap[key]) {
        key = keyMap[key]
      } else if (key.length === 1) {
        if (isSingleAscii(key)) {
          key = key.toUpperCase()
        } else {
          const codeKey = keyFromCode(event.code)
          if (!codeKey) {
            return null
          }
          key = codeKey
        }
      } else if (key.startsWith('F') && /^F\d+$/.test(key)) {
        // Function keys (F1-F12) - keep as is
      } else {
        const codeKey = keyFromCode(event.code)
        if (codeKey) {
          key = codeKey
        } else {
          return null
        }
      }

      if (parts.length === 0) {
        return null
      }

      parts.push(key)
      return parts.join('+')
    }

    const formatAcceleratorForDisplay = (accelerator) => {
      if (!accelerator) return 'Click to set...'

      const isMac = jiminy.platform === 'darwin'
      return accelerator
        .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
        .replace(/Command/g, '⌘')
        .replace(/Control/g, 'Ctrl')
        .replace(/Alt/g, isMac ? '⌥' : 'Alt')
        .replace(/Shift/g, isMac ? '⇧' : 'Shift')
        .replace(/\+/g, ' + ')
    }

    const updateHotkeyDisplay = (role, accelerator) => {
      let buttons = clipboardHotkeyButtons
      if (role === 'capture') {
        buttons = captureHotkeyButtons
      } else if (role === 'recording') {
        buttons = recordingHotkeyButtons
      }
      const value = accelerator || ''
      buttons.forEach((button) => {
        button.dataset.hotkey = value
        button.textContent = formatAcceleratorForDisplay(value)
      })
      setHotkeyValue(role, value)
      updateWizardUI()
    }

    const setHotkeys = (payload = {}) => {
      if (Object.prototype.hasOwnProperty.call(payload, 'capture')) {
        updateHotkeyDisplay('capture', payload.capture)
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'clipboard')) {
        updateHotkeyDisplay('clipboard', payload.clipboard)
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'recording')) {
        updateHotkeyDisplay('recording', payload.recording)
      }
    }

    const startRecording = async (button) => {
      if (recordingElement) {
        await stopRecording(recordingElement)
      }

      if (jiminy.suspendHotkeys) {
        try {
          await jiminy.suspendHotkeys()
          console.log('Global hotkeys suspended for recording')
        } catch (error) {
          console.error('Failed to suspend hotkeys', error)
          setMessage(hotkeysErrors, 'Failed to suspend hotkeys. Try again or restart the app.')
        }
      }

      recordingElement = button
      button.textContent = 'Press keys...'
      button.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-50', 'dark:bg-indigo-900/30')
    }

    const stopRecording = async (button) => {
      if (!button) return true
      button.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50', 'dark:bg-indigo-900/30')
      const role = button.dataset.hotkeyRole || 'capture'
      updateHotkeyDisplay(role, button.dataset.hotkey)

      const wasRecording = recordingElement === button
      if (wasRecording) {
        recordingElement = null
      }

      let resumeOk = true
      if (wasRecording && jiminy.resumeHotkeys) {
        try {
          await jiminy.resumeHotkeys()
          console.log('Global hotkeys resumed after recording')
        } catch (error) {
          console.error('Failed to resume hotkeys', error)
          setMessage(hotkeysErrors, 'Failed to resume hotkeys. Restart the app.')
          resumeOk = false
        }
      }

      return resumeOk
    }

    const handleHotkeyKeydown = async (event) => {
      if (!recordingElement) return

      event.preventDefault()
      event.stopPropagation()

      const accelerator = keyEventToAccelerator(event)
      if (accelerator) {
        const button = recordingElement
        button.dataset.hotkey = accelerator
        const resumeOk = await stopRecording(button)
        if (resumeOk) {
          setMessage(hotkeysErrors, '')
        }
      }
    }

    const setupHotkeyRecorder = (button) => {
      if (!button) return

      button.addEventListener('click', () => {
        void startRecording(button)
      })

      button.addEventListener('blur', () => {
        setTimeout(() => {
          if (recordingElement === button) {
            void stopRecording(button)
          }
        }, 100)
      })

      button.addEventListener('keydown', (event) => {
        void handleHotkeyKeydown(event)
      })
    }

    hotkeyButtons.forEach((button) => setupHotkeyRecorder(button))

    if (hotkeysSaveButtons.length > 0) {
      hotkeysSaveButtons.forEach((button) => {
        button.addEventListener('click', async () => {
          setMessage(hotkeysStatuses, 'Saving...')
          setMessage(hotkeysErrors, '')

          const state = getState()
          const captureHotkey = state.currentCaptureHotkey
          const clipboardHotkey = state.currentClipboardHotkey
          const recordingHotkey = state.currentRecordingHotkey

          if (!captureHotkey && !clipboardHotkey && !recordingHotkey) {
            setMessage(hotkeysStatuses, '')
            setMessage(hotkeysErrors, 'At least one hotkey is required.')
            return
          }

          try {
            const result = await jiminy.saveSettings({ captureHotkey, clipboardHotkey, recordingHotkey })
            if (result && result.ok) {
              if (jiminy.reregisterHotkeys) {
                const reregisterResult = await jiminy.reregisterHotkeys()
                if (reregisterResult && reregisterResult.ok) {
                  setMessage(hotkeysStatuses, 'Saved and applied.')
                } else {
                  const captureError = reregisterResult?.captureHotkey?.ok === false
                  const clipboardError = reregisterResult?.clipboardHotkey?.ok === false
                  const recordingError = reregisterResult?.recordingHotkey?.ok === false
                  if (captureError || clipboardError || recordingError) {
                    const errorParts = []
                    if (captureError) errorParts.push('capture')
                    if (clipboardError) errorParts.push('clipboard')
                    if (recordingError) errorParts.push('recording')
                    setMessage(hotkeysStatuses, 'Saved.')
                    setMessage(hotkeysErrors, `Failed to register ${errorParts.join(' and ')} hotkey. The shortcut may be in use by another app.`)
                  } else {
                    setMessage(hotkeysStatuses, 'Saved.')
                  }
                }
              } else {
                setMessage(hotkeysStatuses, 'Saved. Restart to apply.')
              }
            } else {
              setMessage(hotkeysStatuses, '')
              setMessage(hotkeysErrors, result?.message || 'Failed to save hotkeys.')
            }
          } catch (error) {
            console.error('Failed to save hotkeys', error)
            setMessage(hotkeysStatuses, '')
            setMessage(hotkeysErrors, 'Failed to save hotkeys.')
          }
        })
      })
    }

    if (hotkeysResetButtons.length > 0) {
      hotkeysResetButtons.forEach((button) => {
        button.addEventListener('click', () => {
          updateHotkeyDisplay('capture', DEFAULT_CAPTURE_HOTKEY)
          updateHotkeyDisplay('clipboard', DEFAULT_CLIPBOARD_HOTKEY)
          updateHotkeyDisplay('recording', DEFAULT_RECORDING_HOTKEY)
          setMessage(hotkeysStatuses, '')
          setMessage(hotkeysErrors, '')
        })
      })
    }

    return {
      setHotkeys
    }
  }

  const registry = global.JiminyHotkeys || {}
  registry.createHotkeys = createHotkeys
  global.JiminyHotkeys = registry

  // Export for Node/CommonJS so tests can require this module; browsers ignore this.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(window)
