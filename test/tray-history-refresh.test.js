const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const resetMainModule = () => {
  const mainPath = require.resolve('../src/main')
  delete require.cache[mainPath]
}

test('tray refreshes history items on click', async () => {
  let trayInstance = null
  const historyCalls = []
  const capturedHistoryItems = []
  const historyResponses = [
    [{ summary: 'First flow', status: 'success' }],
    [{ summary: 'Second flow', status: 'failed' }]
  ]
  let historyIndex = 0

  const stubElectron = {
    app: {
      quit: () => {},
      relaunch: () => {},
      exit: () => {},
      whenReady: () => ({
        then: (cb) => {
          cb()
          return { catch: () => {} }
        }
      }),
      on: () => {},
      disableHardwareAcceleration: () => {},
      commandLine: { appendSwitch: () => {} },
      setLoginItemSettings: () => {},
      dock: { hide: () => {} }
    },
    BrowserWindow: function () {},
    Menu: {
      buildFromTemplate: (template) => template
    },
    Tray: function () {
      this._handlers = {}
      this.setToolTip = () => {}
      this.setContextMenu = () => {}
      this.on = (event, handler) => {
        this._handlers[event] = handler
      }
      trayInstance = this
    },
    dialog: { showMessageBox: () => {} },
    nativeImage: {
      createFromPath: () => ({
        isEmpty: () => false,
        resize: () => ({})
      })
    },
    ipcMain: {
      handle: () => {}
    }
  }

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    if (request === './logger') {
      return { initLogging: () => {} }
    }
    if (request === './settings') {
      return { loadSettings: () => ({ contextFolderPath: '/tmp' }) }
    }
    if (request === './history') {
      return {
        getRecentFlows: () => {
          const result = historyResponses[Math.min(historyIndex, historyResponses.length - 1)]
          historyCalls.push(result)
          historyIndex += 1
          return result
        }
      }
    }
    if (request === './menu') {
      return {
        buildTrayMenuTemplate: (options) => {
          capturedHistoryItems.push(options.historyItems)
          return []
        }
      }
    }
    if (
      request === './ipc' ||
      request === './screenshot/capture' ||
      request === './clipboard' ||
      request === './extraction' ||
      request === './analysis' ||
      request === './utils/window' ||
      request === './tray/busy' ||
      request === './toast'
    ) {
      return {
        registerIpcHandlers: () => {},
        registerCaptureHandlers: () => {},
        startCaptureFlow: async () => ({}),
        closeOverlayWindow: () => {},
        captureClipboard: async () => ({}),
        registerExtractionHandlers: () => {},
        registerAnalysisHandlers: () => {},
        showWindow: () => ({ shown: false, reason: 'test', focused: false }),
        registerTrayBusyIndicator: () => ({ dispose: () => {} }),
        showToast: () => {}
      }
    }
    if (request === './hotkeys') {
      return {
        DEFAULT_CAPTURE_HOTKEY: 'Cmd+Shift+P',
        DEFAULT_CLIPBOARD_HOTKEY: 'Cmd+Shift+C',
        registerCaptureHotkey: () => ({ ok: true }),
        registerClipboardHotkey: () => ({ ok: true }),
        unregisterGlobalHotkeys: () => {}
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  resetMainModule()

  try {
    require('../src/main')
    assert.equal(historyCalls.length, 1)
    assert.ok(trayInstance)
    assert.equal(typeof trayInstance._handlers.click, 'function')

    trayInstance._handlers.click()

    assert.equal(historyCalls.length, 2)
    assert.equal(capturedHistoryItems[0][0].summary, 'First flow')
    assert.equal(capturedHistoryItems[1][0].summary, 'Second flow')
  } finally {
    Module._load = originalLoad
    resetMainModule()
  }
})
