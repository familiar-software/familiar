const test = require('node:test')
const assert = require('node:assert/strict')

test('image extraction throws when flow_id is missing', async () => {
  const handlerPath = require.resolve('../src/extraction/image/handler')
  delete require.cache[handlerPath]

  const { handleImageExtractionEvent } = require('../src/extraction/image/handler')

  await assert.rejects(
    () => handleImageExtractionEvent({ metadata: { path: '/tmp/fake.png' } }),
    /flow_id/i
  )
})

test('analysis throws when flow_id is missing', async () => {
  const handlerPath = require.resolve('../src/analysis/handler')
  delete require.cache[handlerPath]

  const { handleAnalysisEvent } = require('../src/analysis/handler')

  await assert.rejects(
    () => handleAnalysisEvent({ result_md_path: '/tmp/result.md' }),
    /flow_id/i
  )
})
