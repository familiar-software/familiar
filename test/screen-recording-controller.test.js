const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const { createScreenRecordingController } = require('../src/screen-recording/controller')

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-'))
  fs.mkdirSync(root, { recursive: true })
  return root
}

const createPresenceMonitor = () => {
  const emitter = new EventEmitter()
  let lastState = null
  return {
    start: () => {},
    stop: () => {},
    on: (...args) => emitter.on(...args),
    off: (...args) => emitter.off(...args),
    emit: (event, payload) => {
      if (event === 'active' || event === 'idle') {
        lastState = event
      }
      emitter.emit(event, payload)
    },
    getState: () => ({ state: lastState })
  }
}

const createScheduler = () => {
  let now = 0
  let nextId = 1
  const timers = new Map()
  return {
    setTimeout: (fn, delay) => {
      const id = nextId++
      timers.set(id, { fn, time: now + delay })
      return id
    },
    clearTimeout: (id) => {
      timers.delete(id)
    },
    advanceBy: (ms) => {
      now += ms
      const due = Array.from(timers.entries())
        .filter(([, timer]) => timer.time <= now)
        .sort((a, b) => a[1].time - b[1].time)
      due.forEach(([id, timer]) => {
        timers.delete(id)
        timer.fn()
      })
    }
  }
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

test('controller starts and stops recording based on activity', async () => {
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

  const controller = createScreenRecordingController({
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

test('manual pause blocks auto restart until pause window elapses', async () => {
  const contextFolderPath = makeTempContext()
  const presence = createPresenceMonitor()
  const scheduler = createScheduler()
  const calls = { start: [], stop: [] }
  const recorder = {
    start: async (payload) => {
      calls.start.push(payload)
    },
    stop: async (payload) => {
      calls.stop.push(payload)
    }
  }

  const controller = createScreenRecordingController({
    presenceMonitor: presence,
    recorder,
    scheduler,
    pauseDurationMs: 5000,
    logger: { log: () => {}, warn: () => {}, error: () => {} }
  })

  controller.start()
  controller.updateSettings({ enabled: true, contextFolderPath })

  presence.emit('active')
  await flushPromises()
  assert.equal(calls.start.length, 1)

  await controller.manualPause()
  await flushPromises()
  assert.equal(calls.stop.length, 1)
  assert.equal(calls.stop[0].reason, 'manual-pause')
  assert.equal(controller.getState().manualPaused, true)

  presence.emit('active')
  await flushPromises()
  assert.equal(calls.start.length, 1)

  scheduler.advanceBy(5000)
  await flushPromises()

  assert.equal(calls.start.length, 2)
  assert.equal(controller.getState().manualPaused, false)
})

test('manual resume cancels the pause timer', async () => {
  const contextFolderPath = makeTempContext()
  const presence = createPresenceMonitor()
  const scheduler = createScheduler()
  const calls = { start: [], stop: [] }
  const recorder = {
    start: async (payload) => {
      calls.start.push(payload)
    },
    stop: async (payload) => {
      calls.stop.push(payload)
    }
  }

  const controller = createScreenRecordingController({
    presenceMonitor: presence,
    recorder,
    scheduler,
    pauseDurationMs: 5000,
    logger: { log: () => {}, warn: () => {}, error: () => {} }
  })

  controller.start()
  controller.updateSettings({ enabled: true, contextFolderPath })

  presence.emit('active')
  await flushPromises()
  assert.equal(calls.start.length, 1)

  await controller.manualPause()
  await flushPromises()
  assert.equal(calls.stop.length, 1)

  scheduler.advanceBy(1000)
  await flushPromises()

  await controller.manualStart()
  await flushPromises()
  assert.equal(calls.start.length, 2)

  scheduler.advanceBy(5000)
  await flushPromises()
  assert.equal(calls.start.length, 2)
})
