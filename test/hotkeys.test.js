const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const resetHotkeysModule = () => {
  const hotkeysPath = require.resolve('../hotkeys')
  delete require.cache[hotkeysPath]
}

const stubElectron = () => {
  const registrations = []

  const stub = {
    globalShortcut: {
      register: (accelerator, callback) => {
        registrations.push({ type: 'register', accelerator, callback })
        return true
      },
      unregister: (accelerator) => {
        registrations.push({ type: 'unregister', accelerator })
      }
    }
  }

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stub
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  return {
    registrations,
    restore: () => {
      Module._load = originalLoad
    }
  }
}

const stubElectronWithFailure = () => {
  const registrations = []

  const stub = {
    globalShortcut: {
      register: (accelerator, callback) => {
        registrations.push({ type: 'register', accelerator, callback })
        return false
      },
      unregister: (accelerator) => {
        registrations.push({ type: 'unregister', accelerator })
      }
    }
  }

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stub
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  return {
    registrations,
    restore: () => {
      Module._load = originalLoad
    }
  }
}

test('registerCaptureHotkey registers and invokes the handler', () => {
  const { registrations, restore } = stubElectron()
  resetHotkeysModule()
  const hotkeys = require('../hotkeys')

  let called = false
  const result = hotkeys.registerCaptureHotkey({
    onCapture: () => {
      called = true
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.accelerator, hotkeys.DEFAULT_CAPTURE_HOTKEY)
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].type, 'register')
  assert.equal(registrations[0].accelerator, hotkeys.DEFAULT_CAPTURE_HOTKEY)

  registrations[0].callback()
  assert.equal(called, true)

  hotkeys.unregisterGlobalHotkeys()
  assert.equal(registrations[1].type, 'unregister')
  assert.equal(registrations[1].accelerator, hotkeys.DEFAULT_CAPTURE_HOTKEY)

  restore()
  resetHotkeysModule()
})

test('registerCaptureHotkey reports failure when registration fails', () => {
  const { registrations, restore } = stubElectronWithFailure()
  resetHotkeysModule()
  const hotkeys = require('../hotkeys')

  const result = hotkeys.registerCaptureHotkey({
    onCapture: () => {}
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'registration-failed')
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].type, 'register')

  hotkeys.unregisterGlobalHotkeys()
  assert.equal(registrations.length, 1)

  restore()
  resetHotkeysModule()
})
