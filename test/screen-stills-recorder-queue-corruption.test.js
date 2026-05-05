const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')

const resetRecorderModule = () => {
  const resolved = require.resolve('../src/screen-stills/recorder')
  delete require.cache[resolved]
}

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-recorder-corrupt-'))
  fs.mkdirSync(root, { recursive: true })
  return root
}

const createLowPowerModeMonitor = () => ({
  start: () => {},
  stop: () => {},
  on: () => {},
  off: () => {},
  isLowPowerModeEnabled: () => false
})

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

async function waitForCondition(predicate, { timeoutMs = 500, intervalMs = 10 } = {}) {
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    if (predicate()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('Timed out waiting for recorder corruption propagation.')
}

test('recorder propagates queued capture sqlite corruption from scheduled captures', async () => {
  resetRecorderModule()

  const previousE2E = process.env.FAMILIAR_E2E
  process.env.FAMILIAR_E2E = '1'

  let intervalCallback = null
  let enqueueCalls = 0
  const fatalErrors = []
  const corruptError = new Error('database disk image is malformed')
  corruptError.code = 'SQLITE_CORRUPT'

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        ipcMain: { on: () => {} },
        app: { getVersion: () => 'test' },
        screen: {},
        desktopCapturer: {}
      }
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true }
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {
            enqueueCalls += 1
            if (enqueueCalls === 2) {
              throw corruptError
            }
          },
          close: () => {}
        })
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const { createRecorder } = require('../src/screen-stills/recorder')
    const recorder = createRecorder({
      logger: { log: () => {}, warn: () => {}, error: () => {} },
      intervalSeconds: 1,
      lowPowerModeMonitor: createLowPowerModeMonitor(),
      scheduler: {
        setInterval: (callback) => {
          intervalCallback = callback
          return { unref: () => {} }
        },
        clearInterval: () => {}
      },
      onFatalError: (error) => {
        fatalErrors.push(error)
      }
    })

    const result = await recorder.start({ contextFolderPath: makeTempContext() })
    assert.equal(result.ok, true)
    assert.equal(enqueueCalls, 1)
    assert.equal(typeof intervalCallback, 'function')

    intervalCallback()
    await flushPromises()
    await waitForCondition(() => enqueueCalls === 2 && fatalErrors.length === 1)

    assert.equal(enqueueCalls, 2)
    assert.equal(fatalErrors.length, 1)
    assert.equal(fatalErrors[0].code, 'SQLITE_CORRUPT')

    await recorder.stop({ reason: 'test' })
  } finally {
    Module._load = originalLoad
    if (previousE2E === undefined) {
      delete process.env.FAMILIAR_E2E
    } else {
      process.env.FAMILIAR_E2E = previousE2E
    }
    resetRecorderModule()
  }
})
