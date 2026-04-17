const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const { saveSettings, loadSettings } = require('../src/settings')

const resetModule = (modulePath) => {
  const resolved = require.resolve(modulePath)
  delete require.cache[resolved]
}

test('settings:applyDefaultContextFolder notifies with full saved settings payload', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-ipc-'))
  const settingsDir = path.join(tmpRoot, 'settings')
  const homeDir = path.join(tmpRoot, 'home')
  fs.mkdirSync(settingsDir, { recursive: true })
  fs.mkdirSync(homeDir, { recursive: true })

  saveSettings({
    alwaysRecordWhenActive: true,
    wizardCompleted: false
  }, { settingsDir })

  const handlers = {}
  const settingsSavedPayloads = []
  const stubElectron = {
    app: {
      getVersion: () => 'test-version',
      focus: () => {},
      getFileIcon: async () => null
    },
    BrowserWindow: {
      fromWebContents: () => null
    },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    },
    ipcMain: {
      handle: (channel, handler) => {
        handlers[channel] = handler
      }
    },
    shell: {
      openPath: async () => '',
      openExternal: async () => {}
    },
    desktopCapturer: {
      getSources: async () => []
    },
    screen: {
      getAllDisplays: () => [],
      getPrimaryDisplay: () => null
    }
  }

  const originalLoad = Module._load
  const originalSettingsDir = process.env.FAMILIAR_SETTINGS_DIR
  const originalHome = process.env.HOME
  process.env.FAMILIAR_SETTINGS_DIR = settingsDir
  process.env.HOME = homeDir

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  resetModule('../src/ipc/settings')

  try {
    const { registerSettingsHandlers } = require('../src/ipc/settings')
    registerSettingsHandlers({
      onSettingsSaved: (payload) => {
        settingsSavedPayloads.push(payload)
      }
    })

    assert.equal(typeof handlers['settings:applyDefaultContextFolder'], 'function')

    const result = await handlers['settings:applyDefaultContextFolder']()
    const persistedSettings = loadSettings({ settingsDir })

    assert.equal(result.ok, true)
    assert.equal(result.contextFolderPath, homeDir)
    assert.equal(fs.existsSync(path.join(homeDir, 'familiar')), true)
    assert.equal(settingsSavedPayloads.length, 1)
    assert.deepEqual(settingsSavedPayloads[0], persistedSettings)
    assert.equal(settingsSavedPayloads[0].contextFolderPath, homeDir)
    assert.equal(settingsSavedPayloads[0].alwaysRecordWhenActive, true)
    assert.equal(settingsSavedPayloads[0].wizardCompleted, false)
  } finally {
    Module._load = originalLoad
    resetModule('../src/ipc/settings')
    process.env.FAMILIAR_SETTINGS_DIR = originalSettingsDir
    process.env.HOME = originalHome
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})
