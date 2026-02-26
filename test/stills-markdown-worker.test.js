const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  parseBatchResponse,
  createStillsMarkdownWorker,
  resolveMarkdownPath
} = require('../src/screen-stills/stills-markdown-worker')
const { RetryableError } = require('../src/utils/retry')

test('parseBatchResponse splits markdown blocks by separator', () => {
  const response = [
    '---',
    'format: familiar-layout-v0',
    '---',
    '# Layout Map',
    'block 1',
    '# OCR',
    '- "A"',
    '---',
    '---',
    'format: familiar-layout-v0',
    '---',
    '# Layout Map',
    'block 2',
    '# OCR',
    '- "B"'
  ].join('\n')

  const map = parseBatchResponse({ responseText: response, imageIds: ['1', '2'] })
  assert.ok(map.get('1').includes('block 1'))
  assert.ok(map.get('2').includes('block 2'))
  assert.ok(!map.get('1').trim().endsWith('---'))
})

test('parseBatchResponse returns empty map when no blocks', () => {
  const map = parseBatchResponse({ responseText: '', imageIds: ['1'] })
  assert.equal(map.size, 0)
})

test('resolveMarkdownPath preserves .clipboard suffix from source still image', () => {
  const contextFolderPath = '/tmp/context'
  const imagePath = '/tmp/context/familiar/stills/session-123/2026-02-20T14-22-33-123Z.clipboard.png'
  const markdownPath = resolveMarkdownPath({ contextFolderPath, imagePath })

  assert.equal(
    markdownPath,
    '/tmp/context/familiar/stills-markdown/session-123/2026-02-20T14-22-33-123Z.clipboard.md'
  )
})

test('writeMarkdownFile applies redaction before persisting markdown fixture patterns', async () => {
  const contextFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-markdown-write-'))
  const imagePath = path.join(
    contextFolderPath,
    'familiar',
    'stills',
    'session-123',
    '2026-02-20T14-22-33-123Z.png'
  )
  await fs.mkdir(path.dirname(imagePath), { recursive: true })
  await fs.writeFile(imagePath, 'fake-image-bytes')
  const fixtureInputPath = path.join(__dirname, 'stills-markdown-redaction-input.md')
  const fixtureExpectedPath = path.join(__dirname, 'stills-markdown-redaction-expected.md')
  const inputMarkdown = await fs.readFile(fixtureInputPath, 'utf-8')
  const expectedMarkdown = await fs.readFile(fixtureExpectedPath, 'utf-8')
  const rgStubDir = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-rg-stub-'))
  const rgStubPath = path.join(rgStubDir, 'rg-stub.js')
  const priorRgBinary = process.env.FAMILIAR_RG_BINARY

  fsSync.writeFileSync(
    rgStubPath,
    [
      '#!/usr/bin/env node',
      'let input = "";',
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", (chunk) => { input += chunk; });',
      'process.stdin.on("end", () => {',
      '  const lines = input.split(/\\n/);',
      '  for (let i = 0; i < lines.length; i += 1) {',
      '    process.stdout.write(JSON.stringify({',
      '      type: "match",',
      '      data: {',
      '        line_number: i + 1,',
      '        submatches: [{ match: { text: "x" }, start: 0, end: 1 }]',
      '      }',
      '    }) + "\\n");',
      '  }',
      '  process.exit(0);',
      '});',
      ''
    ].join('\n'),
    'utf-8'
  )
  fsSync.chmodSync(rgStubPath, 0o755)
  process.env.FAMILIAR_RG_BINARY = rgStubPath

  try {
    const outputPath = await require('../src/screen-stills/stills-markdown-worker').writeMarkdownFile({
      contextFolderPath,
      imagePath,
      markdown: inputMarkdown
    })

    const persisted = await fs.readFile(outputPath, 'utf-8')
    assert.equal(persisted, expectedMarkdown)
  } finally {
    if (priorRgBinary === undefined) {
      delete process.env.FAMILIAR_RG_BINARY
    } else {
      process.env.FAMILIAR_RG_BINARY = priorRgBinary
    }
  }
})

test('stills markdown worker does nothing on empty queue', async () => {
  const calls = { extract: 0, processing: 0 }
  const queue = {
    requeueStaleProcessing: () => 0,
    getPendingBatch: () => [],
    markProcessing: () => { calls.processing += 1 },
    markDone: () => {},
    markFailed: () => {},
    close: () => {}
  }

  const createExtractorImpl = () => ({
    type: 'stub',
    execution: { maxParallelBatches: Infinity },
    canRun: async () => ({ ok: true }),
    extractBatch: async () => {
      calls.extract += 1
      return new Map()
    }
  })

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    isOnlineImpl: async () => true,
    loadSettingsImpl: () => ({}),
    createQueueImpl: () => queue,
    createExtractorImpl
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.equal(calls.extract, 0)
  assert.equal(calls.processing, 0)
})

test('stills markdown worker pauses when offline', async () => {
  const calls = { extract: 0, processing: 0, get: 0 }
  const queue = {
    requeueStaleProcessing: () => 0,
    getPendingBatch: () => {
      calls.get += 1
      return [{ id: 1, image_path: '/tmp/a.webp' }]
    },
    markProcessing: () => { calls.processing += 1 },
    markDone: () => {},
    markFailed: () => {},
    close: () => {}
  }

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    isOnlineImpl: async () => false,
    loadSettingsImpl: () => ({
      stills_markdown_extractor: {
        type: 'llm',
        llm_provider: { provider: 'openai', api_key: 'key', vision_model: 'gpt-4o-mini' }
      }
    }),
    createQueueImpl: () => queue,
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.equal(calls.get, 0)
  assert.equal(calls.extract, 0)
  assert.equal(calls.processing, 0)
})

test('stills markdown worker requeues stale processing rows before fetching', async () => {
  const events = []
  let requeueArgs = null
  const queue = {
    requeueStaleProcessing: (args) => {
      requeueArgs = args
      events.push('requeue')
      return 0
    },
    getPendingBatch: () => {
      events.push('get')
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
    isOnlineImpl: async () => true,
    loadSettingsImpl: () => ({}),
    createQueueImpl: () => queue,
    createExtractorImpl: () => ({
      type: 'stub',
      execution: { maxParallelBatches: Infinity },
      canRun: async () => ({ ok: true }),
      extractBatch: async () => new Map()
    })
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.equal(events[0], 'requeue')
  assert.equal(events[1], 'get')
  assert.equal(typeof requeueArgs?.olderThanMs, 'number')
  assert.ok(requeueArgs.olderThanMs > 0)
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
    requeueStaleProcessing: () => 0,
    getPendingBatch: () => {
      batchCalls += 1
      return batchCalls === 1 ? batch : []
    },
    markProcessing: () => {},
    markDone: ({ id, markdownPath }) => done.push({ id, markdownPath }),
    markFailed: ({ id }) => failed.push(id),
    close: () => {}
  }

  const createExtractorImpl = () => ({
    type: 'stub',
    execution: { maxParallelBatches: Infinity },
    canRun: async () => ({ ok: true }),
    extractBatch: async ({ rows }) => new Map(rows.map((row) => [
      String(row.id),
      { markdown: `Markdown ${row.id}`, providerLabel: 'stub', modelLabel: 'stub' }
    ]))
  })

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    isOnlineImpl: async () => true,
    loadSettingsImpl: () => ({}),
    createQueueImpl: () => queue,
    createExtractorImpl,
    writeMarkdownFileImpl: async ({ imagePath }) => `${imagePath}.md`,
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
    requeueStaleProcessing: () => 0,
    getPendingBatch: () => {
      batchCalls += 1
      return batches[batchCalls - 1] || []
    },
    markProcessing: (ids) => processing.push(ids),
    markDone: ({ id }) => done.push(id),
    markFailed: ({ id }) => failed.push(id),
    close: () => {}
  }

  const createExtractorImpl = () => ({
    type: 'stub',
    execution: { maxParallelBatches: Infinity },
    canRun: async () => ({ ok: true }),
    extractBatch: async ({ rows }) => {
      extractCalls += 1
      return new Map(rows.map((row) => [
        String(row.id),
        { markdown: `Markdown ${row.id}`, providerLabel: 'stub', modelLabel: 'stub' }
      ]))
    }
  })

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    maxBatchesPerTick: 3,
    isOnlineImpl: async () => true,
    loadSettingsImpl: () => ({}),
    createQueueImpl: () => queue,
    createExtractorImpl,
    writeMarkdownFileImpl: async ({ imagePath }) => `${imagePath}.md`,
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
    requeueStaleProcessing: () => 0,
    getPendingBatch: () => {
      batchCalls += 1
      return batchCalls === 1 ? batch : []
    },
    markProcessing: () => {},
    markDone: () => {},
    markFailed: ({ id }) => failed.push(id),
    close: () => {}
  }

  const createExtractorImpl = () => ({
    type: 'stub',
    execution: { maxParallelBatches: Infinity },
    canRun: async () => ({ ok: true }),
    extractBatch: async () => new Map([
      ['1', { markdown: 'Markdown A', providerLabel: 'stub', modelLabel: 'stub' }]
    ])
  })

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    isOnlineImpl: async () => true,
    loadSettingsImpl: () => ({}),
    createQueueImpl: () => queue,
    createExtractorImpl,
    writeMarkdownFileImpl: async ({ imagePath }) => `${imagePath}.md`,
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.deepEqual(failed, [2])
})

test('stills markdown worker requeues on network errors instead of failing', async () => {
  const requeued = []
  const failed = []
  let batchCalls = 0

  const batch = [
    { id: 1, image_path: '/tmp/a.webp' },
    { id: 2, image_path: '/tmp/b.webp' }
  ]

  const queue = {
    requeueStaleProcessing: () => 0,
    getPendingBatch: () => {
      batchCalls += 1
      return batchCalls === 1 ? batch : []
    },
    markProcessing: () => {},
    markDone: () => {},
    markFailed: ({ id }) => failed.push(id),
    markPending: ({ id }) => requeued.push(id),
    close: () => {}
  }

  const createExtractorImpl = () => ({
    type: 'stub',
    execution: { maxParallelBatches: Infinity },
    canRun: async () => ({ ok: true }),
    extractBatch: async () => {
      throw new RetryableError({ status: 'network', message: 'fetch failed', cause: { code: 'ENOTFOUND' } })
    }
  })

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    isOnlineImpl: async () => true,
    loadSettingsImpl: () => ({}),
    createQueueImpl: () => queue,
    createExtractorImpl,
    writeMarkdownFileImpl: async ({ imagePath }) => `${imagePath}.md`,
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.equal(failed.length, 0)
  assert.equal(requeued.length, 2)
})

test('stills markdown worker requeues on retryable HTTP errors instead of failing', async () => {
  const requeued = []
  const failed = []
  let batchCalls = 0

  const batch = [
    { id: 1, image_path: '/tmp/a.webp' },
    { id: 2, image_path: '/tmp/b.webp' }
  ]

  const queue = {
    requeueStaleProcessing: () => 0,
    getPendingBatch: () => {
      batchCalls += 1
      return batchCalls === 1 ? batch : []
    },
    markProcessing: () => {},
    markDone: () => {},
    markFailed: ({ id }) => failed.push(id),
    markPending: ({ id }) => requeued.push(id),
    close: () => {}
  }

  const createExtractorImpl = () => ({
    type: 'stub',
    execution: { maxParallelBatches: Infinity },
    canRun: async () => ({ ok: true }),
    extractBatch: async () => {
      throw new RetryableError({ status: 503, message: 'The model is overloaded. Please try again later.' })
    }
  })

  const worker = createStillsMarkdownWorker({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    pollIntervalMs: 0,
    runImmediately: false,
    isOnlineImpl: async () => true,
    loadSettingsImpl: () => ({}),
    createQueueImpl: () => queue,
    createExtractorImpl,
    writeMarkdownFileImpl: async ({ imagePath }) => `${imagePath}.md`,
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.equal(failed.length, 0)
  assert.equal(requeued.length, 2)
})

test('stills markdown worker requests default batch size limit', async () => {
  let seenLimit = null
  const queue = {
    requeueStaleProcessing: () => 0,
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
    loadSettingsImpl: () => ({}),
    createQueueImpl: () => queue,
    createExtractorImpl: () => ({
      type: 'stub',
      execution: { maxParallelBatches: Infinity },
      canRun: async () => ({ ok: true }),
      extractBatch: async () => new Map()
    })
  })

  worker.start({ contextFolderPath: '/tmp' })
  await worker.runOnce()
  worker.stop()

  assert.equal(seenLimit, 4)
})
