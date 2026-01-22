const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildExtractionPath,
  runImageExtraction,
  writeExtractionFile
} = require('../extraction/image')

test('buildExtractionPath appends extraction suffix', () => {
  const input = '/tmp/Jiminy Capture 2026-01-21_10-00-00-000.png'
  const expected = `${input}-extraction.md`
  assert.equal(buildExtractionPath(input), expected)
})

test('writeExtractionFile writes markdown with newline', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-extract-'))
  const imagePath = path.join(tempDir, 'capture.png')
  const markdown = '# Screenshot Extraction\n\nHello'

  const outputPath = await writeExtractionFile({ imagePath, markdown })
  const saved = await fs.readFile(outputPath, 'utf-8')

  assert.ok(outputPath.endsWith('-extraction.md'))
  assert.ok(saved.endsWith('\n'))
  assert.ok(saved.includes('Screenshot Extraction'))
})

test('runImageExtraction uses mock output when enabled', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-extract-'))
  const imagePath = path.join(tempDir, 'capture.png')
  const originalMock = process.env.JIMINY_LLM_MOCK
  const originalMockText = process.env.JIMINY_LLM_MOCK_TEXT

  process.env.JIMINY_LLM_MOCK = '1'
  process.env.JIMINY_LLM_MOCK_TEXT = 'mock extraction'

  try {
    const result = await runImageExtraction({
      apiKey: '',
      model: 'mock',
      imagePath,
      imageBase64: 'ZmFrZQ=='
    })

    assert.ok(result.outputPath.endsWith('-extraction.md'))
    assert.equal(result.markdown, 'mock extraction')
    const saved = await fs.readFile(result.outputPath, 'utf-8')
    assert.ok(saved.includes('mock extraction'))
  } finally {
    if (typeof originalMock === 'undefined') {
      delete process.env.JIMINY_LLM_MOCK
    } else {
      process.env.JIMINY_LLM_MOCK = originalMock
    }
    if (typeof originalMockText === 'undefined') {
      delete process.env.JIMINY_LLM_MOCK_TEXT
    } else {
      process.env.JIMINY_LLM_MOCK_TEXT = originalMockText
    }
  }
})
