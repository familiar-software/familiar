const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createFinalizationWatchdog
} = require('../src/meeting-recording/finalization-watchdog')

test('meeting finalization watchdog replaces its timer on progress', () => {
  const timers = []
  const scheduler = {
    setTimeout: (callback, delay) => {
      const timer = { callback, delay }
      timers.push(timer)
      return timer
    },
    clearTimeout: (timer) => {
      timer.cleared = true
    }
  }
  const killCalls = []
  const watchdog = createFinalizationWatchdog({
    logger: { warn: () => {} },
    scheduler,
    timeoutMs: 130000
  })
  const helper = { kill: (signal) => killCalls.push(signal) }

  watchdog.touch(helper)
  watchdog.touch(helper)

  assert.equal(timers[0].cleared, true)
  assert.equal(timers[1].delay, 130000)
  timers[1].callback()
  assert.deepEqual(killCalls, ['SIGKILL'])
})
