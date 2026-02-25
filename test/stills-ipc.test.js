const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const resetModule = (modulePath) => {
  const resolved = require.resolve(modulePath)
  delete require.cache[resolved]
}

function withStillsIpcModule(run) {
  const handlers = {}
  const openPathCalls = []
  let openPathResult = ''
  let settings = { contextFolderPath: '' }
  const mkdirCalls = []

  const stubElectron = {
    ipcMain: {
      handle: (channel, handler) => {
        handlers[channel] = handler
      }
    },
    shell: {
      openPath: async (targetPath) => {
        openPathCalls.push(targetPath)
        return openPathResult
      }
    }
  }

  const stubFs = {
    mkdirSync: (targetPath, options) => {
      mkdirCalls.push({ targetPath, options })
    }
  }

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    if (request === 'node:fs') {
      return stubFs
    }
    if (request === '../settings') {
      return {
        loadSettings: () => settings
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  resetModule('../src/ipc/stills')
  const stillsModule = require('../src/ipc/stills')

  return Promise.resolve()
    .then(() =>
      run({
        stillsModule,
        handlers,
        openPathCalls,
        mkdirCalls,
        setOpenPathResult: (value) => {
          openPathResult = value
        },
        setSettings: (value) => {
          settings = value
        }
      })
    )
    .finally(() => {
      Module._load = originalLoad
      resetModule('../src/ipc/stills')
    })
}

test('stills:openFolder opens the familiar root folder under context', async () => {
  await withStillsIpcModule(async ({ stillsModule, handlers, openPathCalls, mkdirCalls, setSettings }) => {
    setSettings({ contextFolderPath: '/tmp/context' })
    stillsModule.registerStillsHandlers()

    assert.equal(typeof handlers['stills:openFolder'], 'function')
    const result = await handlers['stills:openFolder']()

    assert.equal(result.ok, true)
    assert.deepEqual(mkdirCalls, [
      {
        targetPath: '/tmp/context/familiar',
        options: { recursive: true }
      }
    ])
    assert.deepEqual(openPathCalls, ['/tmp/context/familiar'])
  })
})

test('stills:openFolder returns error when context folder is missing', async () => {
  await withStillsIpcModule(async ({ stillsModule, handlers, openPathCalls, mkdirCalls, setSettings }) => {
    setSettings({ contextFolderPath: '' })
    stillsModule.registerStillsHandlers()

    const result = await handlers['stills:openFolder']()
    assert.equal(result.ok, false)
    assert.equal(result.message, 'Context folder is not set.')
    assert.deepEqual(mkdirCalls, [])
    assert.deepEqual(openPathCalls, [])
  })
})

test('stills:openFolder returns error when Finder open fails', async () => {
  await withStillsIpcModule(
    async ({ stillsModule, handlers, openPathCalls, mkdirCalls, setSettings, setOpenPathResult }) => {
      setSettings({ contextFolderPath: '/tmp/context' })
      setOpenPathResult('Unable to open')
      stillsModule.registerStillsHandlers()

      const result = await handlers['stills:openFolder']()
      assert.equal(result.ok, false)
      assert.equal(result.message, 'Failed to open Familiar folder.')
      assert.deepEqual(mkdirCalls, [
        {
          targetPath: '/tmp/context/familiar',
          options: { recursive: true }
        }
      ])
      assert.deepEqual(openPathCalls, ['/tmp/context/familiar'])
    }
  )
})
