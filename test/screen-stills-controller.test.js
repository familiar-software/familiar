const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const { createScreenStillsController } = require('../src/screen-stills/controller')

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-'))
  fs.mkdirSync(root, { recursive: true })
  return root
}

const createPresenceMonitor = () => {
  const emitter = new EventEmitter()
  return {
    start: () => {},
    stop: () => {},
    on: (...args) => emitter.on(...args),
    off: (...args) => emitter.off(...args),
    emit: (event, payload) => emitter.emit(event, payload)
  }
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

test('stills controller starts and stops based on activity', async () => {
  const contextFolderPath = makeTempContext()
  const presence = createPresenceMonitor()
  const calls = { start: [], stop: [] }
  const recorder = {
    start: async (payload) => {
      calls.start.push(payload)
    },
    stop: async (payload) => {
      calls.stop.push(payload)
    }
  }

  const controller = createScreenStillsController({
    presenceMonitor: presence,
    recorder,
    logger: { log: () => {}, warn: () => {}, error: () => {} }
  })

  controller.start()
  controller.updateSettings({ enabled: true, contextFolderPath })

  presence.emit('active')
  await flushPromises()

  assert.equal(calls.start.length, 1)
  assert.equal(controller.getState().state, 'recording')

  presence.emit('idle', { idleSeconds: 120 })
  await flushPromises()

  assert.equal(calls.stop.length, 1)
  assert.equal(calls.stop[0].reason, 'idle')
  assert.equal(controller.getState().state, 'armed')
})

test('stills manual stop pauses auto restart until idle, manual start resumes', async () => {
  const contextFolderPath = makeTempContext()
  const presence = createPresenceMonitor()
  const calls = { start: [], stop: [] }
  const recorder = {
    start: async (payload) => {
      calls.start.push(payload)
    },
    stop: async (payload) => {
      calls.stop.push(payload)
    }
  }

  const controller = createScreenStillsController({
    presenceMonitor: presence,
    recorder,
    logger: { log: () => {}, warn: () => {}, error: () => {} }
  })

  controller.start()
  controller.updateSettings({ enabled: true, contextFolderPath })

  presence.emit('active')
  await flushPromises()
  assert.equal(calls.start.length, 1)

  await controller.manualStop()
  await flushPromises()
  assert.equal(calls.stop.length, 1)

  presence.emit('active')
  await flushPromises()
  assert.equal(calls.start.length, 1)

  presence.emit('idle', { idleSeconds: 120 })
  await flushPromises()

  presence.emit('active')
  await flushPromises()
  assert.equal(calls.start.length, 2)

  await controller.manualStop()
  await flushPromises()
  await controller.manualStart()
  await flushPromises()
  assert.equal(calls.start.length, 3)
})
