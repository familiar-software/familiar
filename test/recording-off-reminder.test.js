const test = require('node:test')
const assert = require('node:assert/strict')

const { createRecordingOffReminder } = require('../src/recording-off-reminder')

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
        .sort(([, a], [, b]) => a.time - b.time)
      due.forEach(([id, timer]) => {
        timers.delete(id)
        timer.fn()
      })
    }
  }
}

test('recording off reminder repeats after recurring delay', async () => {
  const scheduler = createScheduler()
  const messages = []
  const reminder = createRecordingOffReminder({
    delayMs: 15,
    setTimeoutFn: scheduler.setTimeout,
    clearTimeoutFn: scheduler.clearTimeout,
    showToast: (message) => messages.push(message)
  })

  reminder.handleStateTransition({ reason: 'user-toggle-off', toState: 'disabled' })
  scheduler.advanceBy(14)
  assert.equal(messages.length, 0)

  scheduler.advanceBy(1)
  assert.equal(messages.length, 1)

  scheduler.advanceBy(15)
  assert.equal(messages.length, 2)
})

test('recording off reminder stops on manual pause transitions', () => {
  const scheduler = createScheduler()
  const messages = []
  const reminder = createRecordingOffReminder({
    delayMs: 15,
    setTimeoutFn: scheduler.setTimeout,
    clearTimeoutFn: scheduler.clearTimeout,
    showToast: (message) => messages.push(message)
  })

  reminder.handleStateTransition({ reason: 'user-toggle-off', toState: 'disabled' })
  reminder.handleStateTransition({ reason: 'manual-pause', toState: 'stopping' })
  scheduler.advanceBy(30)
  assert.equal(messages.length, 0)
})

test('recording off reminder stops on idle transitions', () => {
  const scheduler = createScheduler()
  const messages = []
  const reminder = createRecordingOffReminder({
    delayMs: 15,
    setTimeoutFn: scheduler.setTimeout,
    clearTimeoutFn: scheduler.clearTimeout,
    showToast: (message) => messages.push(message)
  })

  reminder.handleStateTransition({ reason: 'user-toggle-off', toState: 'disabled' })
  reminder.handleStateTransition({ reason: 'idle', toState: 'stopping' })
  scheduler.advanceBy(30)
  assert.equal(messages.length, 0)
})

test('recording off reminder starts from startup off state and cancels when enabled', () => {
  const scheduler = createScheduler()
  const messages = []
  const reminder = createRecordingOffReminder({
    delayMs: 15,
    setTimeoutFn: scheduler.setTimeout,
    clearTimeoutFn: scheduler.clearTimeout,
    showToast: (message) => messages.push(message)
  })

  reminder.syncWithCurrentState({ enabled: false, manualPaused: false, state: 'disabled' })
  scheduler.advanceBy(15)
  assert.equal(messages.length, 1)

  reminder.syncWithCurrentState({ enabled: true, manualPaused: false, state: 'armed' })
  scheduler.advanceBy(15)
  assert.equal(messages.length, 1)
})

test('recording off reminder cancels when reminder-enabled state is armed', () => {
  const scheduler = createScheduler()
  const messages = []
  const reminder = createRecordingOffReminder({
    delayMs: 15,
    setTimeoutFn: scheduler.setTimeout,
    clearTimeoutFn: scheduler.clearTimeout,
    showToast: (message) => messages.push(message)
  })

  reminder.handleStateTransition({ reason: 'user-toggle-off', toState: 'disabled' })
  reminder.handleStateTransition({ toState: 'armed', reason: 'enabled', enabled: true })
  scheduler.advanceBy(30)
  assert.equal(messages.length, 0)
})
