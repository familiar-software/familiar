const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  extractionQueue,
  registerExtractionHandler,
  clearExtractionHandlers
} = require('../extraction')

test('extraction queue dispatches events to registered handlers', async () => {
  clearExtractionHandlers()

  let handledEvent = null
  registerExtractionHandler('image', async (event) => {
    handledEvent = event
    return { ok: true }
  })

  const event = {
    sourceType: 'image',
    metadata: { path: '/tmp/example.png' }
  }

  const result = await extractionQueue.enqueue(event)
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(handledEvent, event)
})
