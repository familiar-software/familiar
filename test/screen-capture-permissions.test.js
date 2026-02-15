const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const resetModule = (modulePath) => {
  const resolved = require.resolve(modulePath)
  delete require.cache[resolved]
}

const withE2EEnv = (value, fn) => {
  const previous = process.env.FAMILIAR_E2E
  const forcedPermission = process.env.FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION
  if (value === true) {
    process.env.FAMILIAR_E2E = '1'
  } else if (value === false) {
    delete process.env.FAMILIAR_E2E
  } else {
    process.env.FAMILIAR_E2E = String(value)
  }
  return Promise.resolve(fn()).finally(() => {
    if (typeof previous === 'undefined') {
      delete process.env.FAMILIAR_E2E
    } else {
      process.env.FAMILIAR_E2E = previous
    }
    if (typeof forcedPermission === 'undefined') {
      delete process.env.FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION
    } else {
      process.env.FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION = forcedPermission
    }
  })
}

const withE2EOverride = (value, fn) => {
  const previous = process.env.FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION
  if (typeof value === 'undefined') {
    delete process.env.FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION
  } else {
    process.env.FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION = value
  }
  return Promise.resolve(fn()).finally(() => {
    if (typeof previous === 'undefined') {
      delete process.env.FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION
    } else {
      process.env.FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION = previous
    }
  })
}

const canPatchProcessPlatform = (() => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  return Boolean(descriptor && descriptor.configurable)
})()

const withProcessPlatform = async (platform, fn) => {
  if (process.platform === platform) {
    await fn()
    return true
  }

  if (!canPatchProcessPlatform) {
    return false
  }

  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  if (!descriptor) {
    return false
  }

  const originalDescriptor = { ...descriptor }
  Object.defineProperty(process, 'platform', { ...originalDescriptor, value: platform })

  try {
    await fn()
    return true
  } finally {
    Object.defineProperty(process, 'platform', originalDescriptor)
  }
}

test('requestScreenRecordingPermission returns unavailable on non-darwin', async () => {
  const originalLoad = Module._load
  const calls = []

  const stubElectron = {
    systemPreferences: {
      askForMediaAccess: () => {
        calls.push('askForMediaAccess')
        return true
      },
      getMediaAccessStatus: () => {
        calls.push('getMediaAccessStatus')
        return 'granted'
      }
    },
    shell: {}
  }

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const restored = await withProcessPlatform('linux', async () => {
      resetModule('../src/screen-capture/permissions')
      const { requestScreenRecordingPermission } = require('../src/screen-capture/permissions')

    const result = await requestScreenRecordingPermission()

      assert.equal(result.ok, false)
      assert.equal(result.permissionStatus, 'unavailable')
      assert.equal(result.granted, false)
      assert.equal(typeof result.message, 'string')
      assert.equal(calls.length, 0)
    })
    if (!restored) {
      return
    }
  } finally {
    Module._load = originalLoad
    resetModule('../src/screen-capture/permissions')
  }
})

test('requestScreenRecordingPermission auto-grants in E2E mode on darwin', async () => {
  const originalLoad = Module._load
  const askForMediaAccessCalls = []

  const stubElectron = {
    systemPreferences: {
      askForMediaAccess: async () => {
        askForMediaAccessCalls.push('screen')
        return false
      },
      getMediaAccessStatus: () => 'denied'
    },
    shell: {}
  }

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    await withE2EEnv(true, async () => {
      const restored = await withProcessPlatform('darwin', async () => {
        resetModule('../src/screen-capture/permissions')
        const { requestScreenRecordingPermission } = require('../src/screen-capture/permissions')

        const result = await requestScreenRecordingPermission()

        assert.equal(askForMediaAccessCalls.length, 0)
        assert.equal(result.ok, true)
        assert.equal(result.permissionStatus, 'granted')
        assert.equal(result.granted, true)
        assert.equal(result.message == null, true)
      })
      if (!restored) {
        return
      }
    })
  } finally {
    Module._load = originalLoad
    resetModule('../src/screen-capture/permissions')
  }
})

test('requestScreenRecordingPermission respects explicit E2E permission override', async () => {
  const originalLoad = Module._load
  const askForMediaAccessCalls = []

  const stubElectron = {
    systemPreferences: {
      askForMediaAccess: async () => {
        askForMediaAccessCalls.push('screen')
        return true
      },
      getMediaAccessStatus: () => 'granted'
    },
    shell: {}
  }

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    await withE2EEnv(true, async () => {
      await withE2EOverride('denied', async () => {
        const restored = await withProcessPlatform('darwin', async () => {
          resetModule('../src/screen-capture/permissions')
          const { requestScreenRecordingPermission } = require('../src/screen-capture/permissions')

          const result = await requestScreenRecordingPermission()

          assert.equal(askForMediaAccessCalls.length, 0)
          assert.equal(result.ok, true)
          assert.equal(result.permissionStatus, 'denied')
          assert.equal(result.granted, false)
        })
        if (!restored) {
          return
        }
      })
    })
  } finally {
    Module._load = originalLoad
    resetModule('../src/screen-capture/permissions')
  }
})

test('requestScreenRecordingPermission requests permission on macOS', async () => {
  const originalLoad = Module._load
  const askForMediaAccessCalls = []

  const stubElectron = {
    systemPreferences: {
      askForMediaAccess: async () => {
        askForMediaAccessCalls.push('screen')
        return true
      },
      getMediaAccessStatus: () => 'denied'
    },
    shell: {}
  }

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const restored = await withProcessPlatform('darwin', async () => {
      resetModule('../src/screen-capture/permissions')
      const { requestScreenRecordingPermission } = require('../src/screen-capture/permissions')

      const result = await requestScreenRecordingPermission()

      assert.equal(askForMediaAccessCalls.length, 1)
      assert.equal(askForMediaAccessCalls[0], 'screen')
      assert.equal(result.ok, true)
      assert.equal(result.permissionStatus, 'granted')
      assert.equal(result.granted, true)
    })
    if (!restored) {
      return
    }
  } finally {
    Module._load = originalLoad
    resetModule('../src/screen-capture/permissions')
  }
})

test('requestScreenRecordingPermission falls back to status check if askForMediaAccess is not available', async () => {
  const originalLoad = Module._load
  const statusCalls = []

  const stubElectron = {
    systemPreferences: {
      getMediaAccessStatus: () => {
        statusCalls.push(1)
        return 'granted'
      }
    },
    shell: {}
  }

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const restored = await withProcessPlatform('darwin', async () => {
      resetModule('../src/screen-capture/permissions')
      const { requestScreenRecordingPermission } = require('../src/screen-capture/permissions')

      const result = await requestScreenRecordingPermission()

      assert.equal(statusCalls.length, 1)
      assert.equal(result.ok, true)
      assert.equal(result.permissionStatus, 'granted')
      assert.equal(result.granted, true)
    })
    if (!restored) {
      return
    }
  } finally {
    Module._load = originalLoad
    resetModule('../src/screen-capture/permissions')
  }
})
