const test = require('node:test')
const assert = require('node:assert/strict')

const { createAwakeLock } = require('../src/power/awake-lock')

test('awake lock starts prevent-display-sleep and stops idempotently', () => {
  const startedIds = new Set()
  const stoppedIds = []
  const awakeLock = createAwakeLock({
    powerSaveBlocker: {
      start: (type) => {
        assert.equal(type, 'prevent-display-sleep')
        startedIds.add(7)
        return 7
      },
      stop: (id) => {
        stoppedIds.push(id)
        startedIds.delete(id)
      },
      isStarted: (id) => startedIds.has(id)
    },
    logger: { log: () => {} }
  })

  assert.equal(awakeLock.isActive(), false)
  assert.deepEqual(awakeLock.start({ reason: 'test' }), { ok: true, blockerId: 7 })
  assert.equal(awakeLock.isActive(), true)
  assert.equal(awakeLock.start({ reason: 'test' }).alreadyStarted, true)
  assert.deepEqual(stoppedIds, [])

  assert.equal(awakeLock.stop({ reason: 'done' }).ok, true)
  assert.equal(awakeLock.isActive(), false)
  assert.deepEqual(stoppedIds, [7])
  assert.equal(awakeLock.stop({ reason: 'done' }).alreadyStopped, true)
  assert.deepEqual(stoppedIds, [7])
})
