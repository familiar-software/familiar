const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStillsQueue } = require('../src/screen-stills/stills-queue')

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-stills-queue-'))
  fs.mkdirSync(root, { recursive: true })
  return root
}

test('stills queue enqueues and processes rows', () => {
  const contextFolderPath = makeTempContext()
  const queue = createStillsQueue({ contextFolderPath, logger: { log: () => {} } })

  const imagePath = path.join(contextFolderPath, 'jiminy', 'stills', 'session-1', 'frame.webp')
  const capturedAt = new Date().toISOString()

  const inserted = queue.enqueueCapture({
    imagePath,
    sessionId: 'session-1',
    capturedAt
  })

  assert.equal(inserted, true)

  const batch = queue.getPendingBatch(10)
  assert.equal(batch.length, 1)
  assert.equal(batch[0].image_path, imagePath)

  const marked = queue.markProcessing([batch[0].id])
  assert.equal(marked, 1)

  const done = queue.markDone({
    id: batch[0].id,
    markdownPath: path.join(contextFolderPath, 'jiminy', 'stills-markdown', 'frame.md'),
    provider: 'openai',
    model: 'gpt-4o-mini'
  })
  assert.equal(done, 1)

  queue.close()
})

test('stills queue marks failed', () => {
  const contextFolderPath = makeTempContext()
  const queue = createStillsQueue({ contextFolderPath, logger: { log: () => {} } })

  const imagePath = path.join(contextFolderPath, 'jiminy', 'stills', 'session-2', 'frame.webp')
  const capturedAt = new Date().toISOString()

  queue.enqueueCapture({
    imagePath,
    sessionId: 'session-2',
    capturedAt
  })

  const batch = queue.getPendingBatch(10)
  assert.equal(batch.length, 1)

  const marked = queue.markProcessing([batch[0].id])
  assert.equal(marked, 1)

  const failed = queue.markFailed({ id: batch[0].id, error: 'boom' })
  assert.equal(failed, 1)

  queue.close()
})
