const test = require('node:test')
const assert = require('node:assert/strict')

const {
  parseBatchResponse,
  createStillsMarkdownWorker
} = require('../src/screen-stills/stills-markdown-worker')

test('parseBatchResponse splits markdown blocks by separator', () => {
  const response = [
    '---',
    'format: jiminy-layout-v0',
    '---',
    '# Layout Map',
    'block 1',
    '# OCR',
    '- "A"',
    '---',
    '---',
    'format: jiminy-layout-v0',
    '---',
    '# Layout Map',
    'block 2',
    '# OCR',
    '- "B"'
  ].join('\n')

  const map = parseBatchResponse(response, ['1', '2'])
  assert.ok(map.get('1').includes('block 1'))
  assert.ok(map.get('2').includes('block 2'))
  assert.ok(!map.get('1').trim().endsWith('---'))
})

test('parseBatchResponse returns empty map when no blocks', () => {
  const map = parseBatchResponse('', ['1'])
  assert.equal(map.size, 0)
})

test('stills markdown worker does nothing on empty queue', async () => {
  const calls = { extract: 0, processing: 0 }
  const queue = {
    getPendingBatch: () => [],
    markProcessing: () => { calls.processing += 1 },
    markDone: () => {},
    markFailed: () => {},
    close: () => {}
  }

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    loadSettingsImpl: () => ({
      llm_provider: { provider: 'openai', api_key: 'key', vision_model: 'gpt-4o-mini' }
    }),
    createQueueImpl: () => queue,
    extractBatchMarkdownImpl: async () => {
      calls.extract += 1
      return new Map()
    },
    readImageAsBase64Impl: async () => 'ZmFrZQ==',
    inferMimeTypeImpl: () => 'image/webp'
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.equal(calls.extract, 0)
  assert.equal(calls.processing, 0)
})

test('stills markdown worker processes a batch and writes outputs', async () => {
  const done = []
  const failed = []
  let batchCalls = 0
  const batch = [
    { id: 1, image_path: '/tmp/a.webp' },
    { id: 2, image_path: '/tmp/b.webp' }
  ]
  const queue = {
    getPendingBatch: () => {
      batchCalls += 1
      return batchCalls === 1 ? batch : []
    },
    markProcessing: () => {},
    markDone: ({ id, markdownPath }) => done.push({ id, markdownPath }),
    markFailed: ({ id }) => failed.push(id),
    close: () => {}
  }

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    loadSettingsImpl: () => ({
      llm_provider: { provider: 'openai', api_key: 'key', vision_model: 'gpt-4o-mini' }
    }),
    createQueueImpl: () => queue,
    extractBatchMarkdownImpl: async () => new Map([
      ['1', 'Markdown A'],
      ['2', 'Markdown B']
    ]),
    writeMarkdownFileImpl: async ({ imagePath }) => `${imagePath}.md`,
    readImageAsBase64Impl: async () => 'ZmFrZQ==',
    inferMimeTypeImpl: () => 'image/webp'
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.equal(done.length, 2)
  assert.equal(failed.length, 0)
})

test('stills markdown worker processes multiple batches per tick', async () => {
  const done = []
  const failed = []
  const processing = []
  let batchCalls = 0
  let extractCalls = 0
  const batches = [
    [
      { id: 1, image_path: '/tmp/a.webp' },
      { id: 2, image_path: '/tmp/b.webp' }
    ],
    [
      { id: 3, image_path: '/tmp/c.webp' }
    ]
  ]

  const queue = {
    getPendingBatch: () => {
      batchCalls += 1
      return batches[batchCalls - 1] || []
    },
    markProcessing: (ids) => processing.push(ids),
    markDone: ({ id }) => done.push(id),
    markFailed: ({ id }) => failed.push(id),
    close: () => {}
  }

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    maxBatchesPerTick: 3,
    loadSettingsImpl: () => ({
      llm_provider: { provider: 'openai', api_key: 'key', vision_model: 'gpt-4o-mini' }
    }),
    createQueueImpl: () => queue,
    extractBatchMarkdownImpl: async ({ images }) => {
      extractCalls += 1
      return new Map(images.map((image) => [String(image.id), `Markdown ${image.id}`]))
    },
    writeMarkdownFileImpl: async ({ imagePath }) => `${imagePath}.md`,
    readImageAsBase64Impl: async () => 'ZmFrZQ==',
    inferMimeTypeImpl: () => 'image/webp'
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.equal(done.length, 3)
  assert.equal(failed.length, 0)
  assert.equal(extractCalls, 2)
  assert.equal(processing.length, 2)
  assert.equal(batchCalls, 3)
})

test('stills markdown worker marks failed when response is missing an id', async () => {
  const failed = []
  let batchCalls = 0
  const batch = [
    { id: 1, image_path: '/tmp/a.webp' },
    { id: 2, image_path: '/tmp/b.webp' }
  ]
  const queue = {
    getPendingBatch: () => {
      batchCalls += 1
      return batchCalls === 1 ? batch : []
    },
    markProcessing: () => {},
    markDone: () => {},
    markFailed: ({ id }) => failed.push(id),
    close: () => {}
  }

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    loadSettingsImpl: () => ({
      llm_provider: { provider: 'openai', api_key: 'key', vision_model: 'gpt-4o-mini' }
    }),
    createQueueImpl: () => queue,
    extractBatchMarkdownImpl: async () => new Map([
      ['1', 'Markdown A']
    ]),
    writeMarkdownFileImpl: async ({ imagePath }) => `${imagePath}.md`,
    readImageAsBase64Impl: async () => 'ZmFrZQ==',
    inferMimeTypeImpl: () => 'image/webp'
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.deepEqual(failed, [2])
})

test('stills markdown worker requests default batch size limit', async () => {
  let seenLimit = null
  const queue = {
    getPendingBatch: (limit) => {
      seenLimit = limit
      return []
    },
    markProcessing: () => {},
    markDone: () => {},
    markFailed: () => {},
    close: () => {}
  }

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    loadSettingsImpl: () => ({
      llm_provider: { provider: 'openai', api_key: 'key', vision_model: 'gpt-4o-mini' }
    }),
    createQueueImpl: () => queue,
    readImageAsBase64Impl: async () => 'ZmFrZQ==',
    inferMimeTypeImpl: () => 'image/webp'
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.equal(seenLimit, 10)
})
