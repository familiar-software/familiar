const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const Module = require('node:module')

const resetRequireCache = () => {
  const capturePath = require.resolve('../screenshot/capture')
  delete require.cache[capturePath]
}

const makeVisibleWindow = (visible = true) => ({
  isDestroyed: () => false,
  isVisible: () => visible
})

const stubElectron = ({ focusedWindow, windows, notificationSupported = true } = {}) => {
  const messageBoxCalls = []
  const notificationCalls = []

  class FakeNotification {
    constructor (payload) {
      notificationCalls.push(payload)
    }

    show () {}

    static isSupported () {
      return notificationSupported
    }
  }

  const BrowserWindow = function () {}
  BrowserWindow.getFocusedWindow = () => focusedWindow || null
  BrowserWindow.getAllWindows = () => (Array.isArray(windows) ? windows : [])

  const stub = {
    app: {
      getAppPath: () => '/tmp',
      getName: () => 'Jiminy',
      isPackaged: false,
      isReady: () => true,
      once: () => {}
    },
    BrowserWindow,
    desktopCapturer: {
      getSources: async () => []
    },
    ipcMain: {
      handle: () => {}
    },
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        scaleFactor: 1
      })
    },
    dialog: {
      showMessageBox: async (...args) => {
        messageBoxCalls.push(args)
        return {}
      }
    },
    Notification: FakeNotification
  }

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stub
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  return {
    messageBoxCalls,
    notificationCalls,
    restore: () => {
      Module._load = originalLoad
    }
  }
}

test('startCaptureFlow uses notification when no focused visible window exists', async () => {
  const tempSettingsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-settings-'))
  const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR
  process.env.JIMINY_SETTINGS_DIR = tempSettingsDir

  const { messageBoxCalls, notificationCalls, restore } = stubElectron({
    focusedWindow: null
  })
  resetRequireCache()

  try {
    const capture = require('../screenshot/capture')
    const result = await capture.startCaptureFlow()

    assert.equal(result.ok, false)
    assert.equal(messageBoxCalls.length, 0)
    assert.equal(notificationCalls.length, 1)
    assert.equal(notificationCalls[0].title, 'Context Folder Required')
  } finally {
    restore()
    resetRequireCache()
    if (typeof previousSettingsDir === 'undefined') {
      delete process.env.JIMINY_SETTINGS_DIR
    } else {
      process.env.JIMINY_SETTINGS_DIR = previousSettingsDir
    }
  }
})

test('startCaptureFlow uses dialog when a visible window exists', async () => {
  const tempSettingsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-settings-'))
  const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR
  process.env.JIMINY_SETTINGS_DIR = tempSettingsDir

  const focusedWindow = makeVisibleWindow(true)
  const { messageBoxCalls, notificationCalls, restore } = stubElectron({
    focusedWindow,
    windows: []
  })
  resetRequireCache()

  try {
    const capture = require('../screenshot/capture')
    const result = await capture.startCaptureFlow()

    assert.equal(result.ok, false)
    assert.equal(messageBoxCalls.length, 1)
    assert.equal(messageBoxCalls[0][0], focusedWindow)
    assert.equal(notificationCalls.length, 0)
  } finally {
    restore()
    resetRequireCache()
    if (typeof previousSettingsDir === 'undefined') {
      delete process.env.JIMINY_SETTINGS_DIR
    } else {
      process.env.JIMINY_SETTINGS_DIR = previousSettingsDir
    }
  }
})
