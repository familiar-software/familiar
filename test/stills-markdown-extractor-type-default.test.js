const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeExtractorType,
  createAppleVisionOcrExtractor
} = require('../src/screen-stills/stills-markdown-extractor')

test('normalizeExtractorType defaults to local when nothing is configured', () => {
  assert.equal(normalizeExtractorType({}), 'apple_vision_ocr')
  assert.equal(normalizeExtractorType({ stills_markdown_extractor: {} }), 'apple_vision_ocr')
})

test('normalizeExtractorType defaults to local when an LLM provider is configured but type is missing', () => {
  assert.equal(
    normalizeExtractorType({
      stills_markdown_extractor: { llm_provider: { provider: 'openai' } }
    }),
    'apple_vision_ocr'
  )
  assert.equal(
    normalizeExtractorType({
      stills_markdown_extractor: { llm_provider: { api_key: 'sk-test' } }
    }),
    'apple_vision_ocr'
  )
})

test('normalizeExtractorType respects explicit types', () => {
  assert.equal(normalizeExtractorType({ stills_markdown_extractor: { type: 'llm' } }), 'llm')
  assert.equal(normalizeExtractorType({ stills_markdown_extractor: { type: 'cloud' } }), 'llm')
  assert.equal(normalizeExtractorType({ stills_markdown_extractor: { type: 'apple_vision_ocr' } }), 'apple_vision_ocr')
  assert.equal(normalizeExtractorType({ stills_markdown_extractor: { type: 'apple' } }), 'apple_vision_ocr')
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
