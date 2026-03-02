const assert = require('node:assert/strict')
const { test } = require('node:test')

const { createMoveContextFolderHandler } = require('../src/context-folder/move-handler')

test('move context folder handler rejects destinations inside current context folder', async () => {
  const sourceContextFolderPath = '/tmp/context'
  const destinationContextFolderPath = '/tmp/context/familiar/stills'
  let moveCalled = false

  const handler = createMoveContextFolderHandler({
    loadSettings: () => ({
      contextFolderPath: sourceContextFolderPath,
      alwaysRecordWhenActive: false
    }),
    saveSettings: () => null,
    validateContextFolderPath: (path) => ({ ok: true, path }),
    moveFamiliarFolder: () => {
      moveCalled = true
      throw new Error('move should not be called for invalid destination')
    },
    updateScreenCaptureFromSettings: () => {},
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {}
    }
  })

  const result = await handler({ contextFolderPath: destinationContextFolderPath })

  assert.equal(result.ok, false)
  assert.match(result.message, /must not be inside the current familiar folder/i)
  assert.equal(moveCalled, false)
})

test('move context folder handler allows destinations outside the current familiar folder', async () => {
  const sourceContextFolderPath = '/tmp/context'
  const destinationContextFolderPath = '/tmp/context/projects'
  const moveCalls = []

  const handler = createMoveContextFolderHandler({
    loadSettings: () => ({
      contextFolderPath: sourceContextFolderPath,
      alwaysRecordWhenActive: false
    }),
    saveSettings: () => null,
    validateContextFolderPath: (path) => ({ ok: true, path }),
    moveFamiliarFolder: ({ sourceContextFolderPath: source, destinationContextFolderPath: destination }) => {
      moveCalls.push({ source, destination })
      return { method: 'rename' }
    },
    updateScreenCaptureFromSettings: () => {},
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {}
    }
  })

  const result = await handler({ contextFolderPath: destinationContextFolderPath })

  assert.equal(result.ok, true)
  assert.equal(result.contextFolderPath, destinationContextFolderPath)
  assert.equal(moveCalls.length, 1)
  assert.deepEqual(moveCalls[0], {
    source: sourceContextFolderPath,
    destination: destinationContextFolderPath
  })
})

test('move context folder handler fails with explicit restore error when save setting fails', async () => {
  const sourceContextFolderPath = '/tmp/source-context'
  const destinationContextFolderPath = '/tmp/destination-context'
  const moveCalls = []

  const handler = createMoveContextFolderHandler({
    loadSettings: () => ({
      contextFolderPath: sourceContextFolderPath,
      alwaysRecordWhenActive: false
    }),
    saveSettings: (payload) => {
      if (typeof payload?.contextFolderPath === 'string') {
        throw new Error('disk full')
      }
      return null
    },
    validateContextFolderPath: (path) => ({ ok: true, path }),
    moveFamiliarFolder: async ({ sourceContextFolderPath: source, destinationContextFolderPath: destination, logger }) => {
      moveCalls.push({ source, destination, hasLogger: Boolean(logger) })
      if (source === sourceContextFolderPath && destination === destinationContextFolderPath) {
        return { method: 'rename' }
      }
      if (source === destinationContextFolderPath && destination === sourceContextFolderPath) {
        throw new Error('restore failed')
      }
      return { method: 'rename' }
    },
    updateScreenCaptureFromSettings: () => {},
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {}
    }
  })

  const result = await handler({ contextFolderPath: destinationContextFolderPath })

  assert.equal(result.ok, false)
  assert.match(result.message, /restore.*failed/i)
  assert.equal(moveCalls.length, 2)
  assert.deepEqual(moveCalls[0], {
    source: sourceContextFolderPath,
    destination: destinationContextFolderPath,
    hasLogger: true
  })
})

test('move context folder handler restores capture setting after move failure', async () => {
  const sourceContextFolderPath = '/tmp/source-context'
  const destinationContextFolderPath = '/tmp/destination-context'
  const updateCalls = []
  const saveCalls = []

  const handler = createMoveContextFolderHandler({
    loadSettings: () => ({
      contextFolderPath: sourceContextFolderPath,
      alwaysRecordWhenActive: true
    }),
    saveSettings: (payload) => {
      saveCalls.push(payload)
      if (payload.alwaysRecordWhenActive === true && saveCalls.length === 2) {
        throw new Error('failed to re-enable recording')
      }
      return null
    },
    validateContextFolderPath: (path) => ({ ok: true, path }),
    moveFamiliarFolder: async ({ sourceContextFolderPath: source, destinationContextFolderPath: destination }) => {
      if (source === sourceContextFolderPath && destination === destinationContextFolderPath) {
        throw new Error('move failed')
      }
      return { method: 'rename' }
    },
    updateScreenCaptureFromSettings: () => {
      updateCalls.push('updated')
    },
    notifyAlwaysRecordWhenActiveChanged: ({ enabled }) => {
      updateCalls.push(enabled ? 'enabled' : 'disabled')
    },
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {}
    }
  })

  const result = await handler({ contextFolderPath: destinationContextFolderPath })

  assert.equal(result.ok, false)
  assert.match(result.message, /Failed to move familiar folder: move failed/i)
  assert.match(result.message, /could not be restored: failed to re-enable recording/i)
  assert.equal(saveCalls.length, 2)
  assert.deepEqual(saveCalls[0], { alwaysRecordWhenActive: false })
  assert.deepEqual(updateCalls, ['updated', 'disabled'])
})
