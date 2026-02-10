const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const resetModule = (modulePath) => {
  const resolved = require.resolve(modulePath)
  delete require.cache[resolved]
}

test('logs:copyCurrentLogToClipboard copies current log content into clipboard', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-logs-ipc-'))
  const logDir = path.join(tmpDir, 'logs')
  const logPath = path.join(logDir, 'jiminy.log')
  fs.mkdirSync(logDir, { recursive: true })
  fs.writeFileSync(logPath, 'hello log\nline 2\n', 'utf8')

  const handlers = {}
  const clipboardWrites = []

  const stubElectron = {
    clipboard: {
      writeText: (value) => clipboardWrites.push(value)
    },
    ipcMain: {
      handle: (channel, handler) => {
        handlers[channel] = handler
      }
    }
  }

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  const originalEnv = process.env.JIMINY_SETTINGS_DIR
  process.env.JIMINY_SETTINGS_DIR = tmpDir

  resetModule('../src/ipc/logs')

  try {
    const { registerLogsHandlers } = require('../src/ipc/logs')
    registerLogsHandlers()

    assert.equal(typeof handlers['logs:copyCurrentLogToClipboard'], 'function')
    const result = await handlers['logs:copyCurrentLogToClipboard']()

    assert.equal(result.ok, true)
    assert.equal(typeof result.bytes, 'number')
    assert.equal(result.path, logPath)
    assert.equal(clipboardWrites.length, 1)
    assert.equal(clipboardWrites[0], 'hello log\nline 2\n')
  } finally {
    Module._load = originalLoad
    resetModule('../src/ipc/logs')
    process.env.JIMINY_SETTINGS_DIR = originalEnv
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('logs:copyCurrentLogToClipboard returns error when log file is missing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-logs-ipc-missing-'))

  const handlers = {}
  const clipboardWrites = []

  const stubElectron = {
    clipboard: {
      writeText: (value) => clipboardWrites.push(value)
    },
    ipcMain: {
      handle: (channel, handler) => {
        handlers[channel] = handler
      }
    }
  }

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  const originalEnv = process.env.JIMINY_SETTINGS_DIR
  process.env.JIMINY_SETTINGS_DIR = tmpDir

  resetModule('../src/ipc/logs')

  try {
    const { registerLogsHandlers } = require('../src/ipc/logs')
    registerLogsHandlers()

    const result = await handlers['logs:copyCurrentLogToClipboard']()
    assert.equal(result.ok, false)
    assert.equal(typeof result.message, 'string')
    assert.equal(clipboardWrites.length, 0)
  } finally {
    Module._load = originalLoad
    resetModule('../src/ipc/logs')
    process.env.JIMINY_SETTINGS_DIR = originalEnv
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

