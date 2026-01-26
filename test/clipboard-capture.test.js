const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

const resetRequireCache = () => {
  const capturePath = require.resolve('../src/clipboard/capture')
  delete require.cache[capturePath]
}

test('captureClipboard surfaces analysis enqueue failures', async () => {
  const toastCalls = []
  const originalLoad = Module._load

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return { clipboard: { readText: () => 'hello from clipboard' } }
    }
    if (request === './storage') {
      return {
        getClipboardDirectory: () => '/tmp',
        saveClipboardToDirectory: async () => ({ path: '/tmp/clipboard.md' })
      }
    }
    if (request === '../analysis') {
      return {
        enqueueAnalysis: async () => {
          throw new Error('enqueue failed')
        }
      }
    }
    if (request === '../settings') {
      return {
        loadSettings: () => ({ contextFolderPath: '/tmp' }),
        validateContextFolderPath: () => ({ ok: true, path: '/tmp' })
      }
    }
    if (request === '../toast') {
      return {
        showToast: (payload) => {
          toastCalls.push(payload)
        }
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  resetRequireCache()

  try {
    const { captureClipboard } = require('../src/clipboard/capture')
    const result = await captureClipboard()
    await flushPromises()

    assert.equal(result.ok, true)
    assert.equal(toastCalls.length, 2)
    assert.equal(toastCalls[0].type, 'success')
    assert.equal(toastCalls[0].title, 'Clipboard Captured')
    assert.equal(toastCalls[1].type, 'warning')
    assert.equal(toastCalls[1].title, 'Clipboard Captured (Not Queued)')
  } finally {
    Module._load = originalLoad
    resetRequireCache()
  }
})

test('captureClipboard passes flow_id to analysis enqueue', async () => {
  const toastCalls = []
  const originalLoad = Module._load
  let capturedFlowId = null
  let capturedAnalysisEvent = null

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return { clipboard: { readText: () => 'hello from clipboard' } }
    }
    if (request === './storage') {
      return {
        getClipboardDirectory: () => '/tmp',
        saveClipboardToDirectory: async () => ({ path: '/tmp/clipboard.md' })
      }
    }
    if (request === '../analysis') {
      return {
        enqueueAnalysis: async (event) => {
          capturedAnalysisEvent = event
          return { ok: true }
        }
      }
    }
    if (request === '../settings') {
      return {
        loadSettings: () => ({ contextFolderPath: '/tmp' }),
        validateContextFolderPath: () => ({ ok: true, path: '/tmp' })
      }
    }
    if (request === '../history') {
      return {
        recordEvent: (payload) => {
          if (!capturedFlowId && payload?.flowId) {
            capturedFlowId = payload.flowId
          }
        }
      }
    }
    if (request === '../toast') {
      return {
        showToast: (payload) => {
          toastCalls.push(payload)
        }
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  resetRequireCache()

  try {
    const { captureClipboard } = require('../src/clipboard/capture')
    const result = await captureClipboard()
    await flushPromises()

    assert.equal(result.ok, true)
    assert.ok(capturedFlowId)
    assert.equal(capturedAnalysisEvent.flow_id, capturedFlowId)
  } finally {
    Module._load = originalLoad
    resetRequireCache()
  }
})
