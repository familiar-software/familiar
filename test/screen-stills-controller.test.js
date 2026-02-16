const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const { createScreenStillsController } = require('../src/screen-stills/controller')

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-'))
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

const createClock = (initialMs = 0) => {
  let now = initialMs
  return {
    now: () => now,
    advance: (ms) => {
      now += ms
    }
  }
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))
const silentLogger = { log: () => {}, warn: () => {}, error: () => {} }

const setupController = () => {
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
  const workerCalls = { start: 0, stop: 0 }
  const markdownWorker = {
    start: () => {
      workerCalls.start += 1
    },
    stop: () => {
      workerCalls.stop += 1
    }
  }
  const controller = createScreenStillsController({
    presenceMonitor: presence,
    recorder,
    markdownWorker,
    logger: silentLogger
  })

  controller.start()
  controller.updateSettings({ enabled: true, contextFolderPath })

  return {
    controller,
    presence,
    calls,
    workerCalls,
    contextFolderPath
  }
}

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
  const markdownWorker = { start: () => {}, stop: () => {} }

  const controller = createScreenStillsController({
    presenceMonitor: presence,
    recorder,
    markdownWorker,
    logger: silentLogger
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

test('stills manual pause blocks auto restart until pause window elapses', async () => {
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
  const markdownWorker = { start: () => {}, stop: () => {} }

  const controller = createScreenStillsController({
    presenceMonitor: presence,
    recorder,
    markdownWorker,
    scheduler,
    pauseDurationMs: 5000,
    logger: silentLogger
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

test('stills manual resume cancels the pause timer', async () => {
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
  const markdownWorker = { start: () => {}, stop: () => {} }

  const controller = createScreenStillsController({
    presenceMonitor: presence,
    recorder,
    markdownWorker,
    scheduler,
    pauseDurationMs: 5000,
    logger: silentLogger
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

test('stills manual pause reports countdown remaining based on clock', async () => {
  const contextFolderPath = makeTempContext()
  const presence = createPresenceMonitor()
  const scheduler = createScheduler()
  const clock = createClock(0)
  const calls = { start: [], stop: [] }
  const recorder = {
    start: async (payload) => {
      calls.start.push(payload)
    },
    stop: async (payload) => {
      calls.stop.push(payload)
    }
  }
  const markdownWorker = { start: () => {}, stop: () => {} }

  const controller = createScreenStillsController({
    presenceMonitor: presence,
    recorder,
    markdownWorker,
    scheduler,
    clock,
    pauseDurationMs: 5000,
    logger: silentLogger
  })

  controller.start()
  controller.updateSettings({ enabled: true, contextFolderPath })

  presence.emit('active')
  await flushPromises()
  assert.equal(calls.start.length, 1)

  await controller.manualPause()
  await flushPromises()
  const pausedState = controller.getState()
  assert.equal(pausedState.manualPaused, true)
  assert.equal(pausedState.pauseRemainingMs, 5000)

  clock.advance(1200)
  const laterPausedState = controller.getState()
  assert.equal(laterPausedState.pauseRemainingMs, 3800)

  await controller.manualStart()
  await flushPromises()
  assert.equal(controller.getState().manualPaused, false)
  assert.equal(controller.getState().pauseRemainingMs, 0)
  assert.equal(calls.start.length, 2)
})

test('stills worker stops when recording stops from presence events', async (t) => {
  const scenarios = [
    { name: 'idle', payload: { idleSeconds: 120 } },
    { name: 'lock' },
    { name: 'suspend' }
  ]

  for (const scenario of scenarios) {
    await t.test(`stops worker on ${scenario.name}`, async () => {
      const { presence, calls, workerCalls } = setupController()

      presence.emit('active')
      await flushPromises()
      assert.equal(calls.start.length, 1)

      presence.emit(scenario.name, scenario.payload)
      await flushPromises()

      assert.equal(calls.stop.length, 1)
      assert.equal(workerCalls.stop, 1)
    })
  }
})

test('stills worker stops when recording pauses manually', async () => {
  const { controller, presence, calls, workerCalls } = setupController()

  presence.emit('active')
  await flushPromises()
  assert.equal(calls.start.length, 1)

  await controller.manualPause()
  await flushPromises()

  assert.equal(calls.stop.length, 1)
  assert.equal(workerCalls.stop, 1)
})

test('stills controller retries start after an error when presence stays active', async () => {
  const contextFolderPath = makeTempContext()
  const presence = createPresenceMonitor()
  const scheduler = createScheduler()
  const calls = { start: [], stop: [] }
  let attempt = 0
  const recorder = {
    start: async (payload) => {
      calls.start.push(payload)
      attempt += 1
      if (attempt === 1) {
        throw new Error('Transient start failure')
      }
    },
    stop: async (payload) => {
      calls.stop.push(payload)
    }
  }
  const markdownWorker = { start: () => {}, stop: () => {} }

  const controller = createScreenStillsController({
    presenceMonitor: presence,
    recorder,
    markdownWorker,
    scheduler,
    startRetryIntervalMs: 1000,
    logger: silentLogger
  })

  controller.start()
  controller.updateSettings({ enabled: true, contextFolderPath })

  presence.emit('active')
  await flushPromises()
  assert.equal(calls.start.length, 1)
  assert.equal(controller.getState().state, 'armed')

  scheduler.advanceBy(999)
  await flushPromises()
  assert.equal(calls.start.length, 1)

  scheduler.advanceBy(1)
  await flushPromises()
  assert.equal(calls.start.length, 2)
  assert.equal(controller.getState().state, 'recording')
})

test('stills controller does not retry start when presence becomes idle before cooldown elapses', async () => {
  const contextFolderPath = makeTempContext()
  const presence = createPresenceMonitor()
  const scheduler = createScheduler()
  const calls = { start: [], stop: [] }
  const recorder = {
    start: async (payload) => {
      calls.start.push(payload)
      throw new Error('Transient start failure')
    },
    stop: async (payload) => {
      calls.stop.push(payload)
    }
  }
  const markdownWorker = { start: () => {}, stop: () => {} }

  const controller = createScreenStillsController({
    presenceMonitor: presence,
    recorder,
    markdownWorker,
    scheduler,
    startRetryIntervalMs: 1000,
    logger: silentLogger
  })

  controller.start()
  controller.updateSettings({ enabled: true, contextFolderPath })

  presence.emit('active')
  await flushPromises()
  assert.equal(calls.start.length, 1)

  presence.emit('idle', { idleSeconds: 120 })
  await flushPromises()

  scheduler.advanceBy(1000)
  await flushPromises()
  assert.equal(calls.start.length, 1)
})
