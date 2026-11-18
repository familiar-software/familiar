const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createStillsMarkdownExtractor,
  createAppleVisionOcrExtractor
} = require('../src/screen-stills/stills-markdown-extractor')

test('createStillsMarkdownExtractor always uses Apple Vision OCR', () => {
  const extractor = createStillsMarkdownExtractor({
    settings: { stills_markdown_extractor: { type: 'llm' } },
    resolveBinaryPathImpl: async () => '/tmp/familiar-ocr-helper',
    runAppleVisionOcrBinaryImpl: async () => ({ meta: {}, lines: [] }),
    buildMarkdownLayoutFromOcrImpl: () => 'mock markdown'
  })

  assert.equal(extractor.type, 'apple_vision_ocr')
})

test('apple vision ocr extractor caps parallel batches at 2', () => {
  const extractor = createAppleVisionOcrExtractor({
    settings: { stills_markdown_extractor: { type: 'apple_vision_ocr' } },
    resolveBinaryPathImpl: async () => '/tmp/familiar-ocr-helper',
    runAppleVisionOcrBinaryImpl: async () => ({ meta: {}, lines: [] }),
    buildMarkdownLayoutFromOcrImpl: () => 'mock markdown'
  })

  assert.equal(extractor.execution.maxParallelBatches, 2)
})

test('apple vision extractor passes visible window names into markdown builder', async () => {
  let visibleWindowNamesSeen
  const extractor = createAppleVisionOcrExtractor({
    settings: { stills_markdown_extractor: { type: 'apple_vision_ocr' } },
    resolveBinaryPathImpl: async () => '/tmp/familiar-ocr-helper',
    runAppleVisionOcrBinaryImpl: async () => ({
      meta: {},
      lines: ['test']
    }),
    buildMarkdownLayoutFromOcrImpl: ({ visibleWindowNames }) => {
      visibleWindowNamesSeen = visibleWindowNames
      return 'mock markdown'
    }
  })

  const result = await extractor.extractBatch({
    rows: [{
      id: 1,
      image_path: '/tmp/image.png',
      visible_window_names: JSON.stringify(['Code', 'Google Chrome'])
    }]
  })

  assert.equal(result.get('1')?.markdown, 'mock markdown')
  assert.deepEqual(visibleWindowNamesSeen, ['Code', 'Google Chrome'])
})

test('apple vision extractor passes OCR timeout settings and records per-still failures', async () => {
  const calls = []
  const extractor = createAppleVisionOcrExtractor({
    settings: { stills_markdown_extractor: { timeoutMs: 1234, timeoutRetries: 1 } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    resolveBinaryPathImpl: async () => '/tmp/familiar-ocr-helper',
    runAppleVisionOcrBinaryImpl: async (options) => {
      calls.push(options)
      if (options.imagePath === '/tmp/hung.png') {
        throw new Error('Apple Vision OCR helper timed out after 1234ms (2 attempts)')
      }
      return { meta: {}, lines: ['ok'] }
    },
    buildMarkdownLayoutFromOcrImpl: () => 'mock markdown'
  })

  const result = await extractor.extractBatch({
    rows: [
      { id: 1, image_path: '/tmp/hung.png' },
      { id: 2, image_path: '/tmp/ok.png' }
    ]
  })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].timeoutMs, 1234)
  assert.equal(calls[0].timeoutRetries, 1)
  assert.deepEqual(result.get('1'), {
    error: 'Apple Vision OCR helper timed out after 1234ms (2 attempts)'
  })
  assert.equal(result.get('2')?.markdown, 'mock markdown')
})
