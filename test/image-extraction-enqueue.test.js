const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

const resetRequireCache = () => {
  const handlerPath = require.resolve('../src/extraction/image/handler')
  delete require.cache[handlerPath]
}

test('image extraction surfaces analysis enqueue failures', async () => {
  const flowId = 'flow-analysis-enqueue-fail'
  const toastCalls = []
  const originalLoad = Module._load

  Module._load = function (request, parent, isMain) {
    if (request === '../../settings') {
      return {
        loadSettings: () => ({
          llm_provider: { provider: 'openai', api_key: 'test-key', vision_model: 'gpt-4o-mini' }
        })
      }
    }
    if (request === '../../analysis') {
      return {
        enqueueAnalysis: async () => {
          throw new Error('enqueue failed')
        }
      }
    }
    if (request === '../../toast') {
      return {
        showToast: (payload) => {
          toastCalls.push(payload)
        }
      }
    }
    if (request === '../../modelProviders') {
      return { ExhaustedLlmProviderError: class ExhaustedLlmProviderError extends Error {} }
    }
    if (request === './index') {
      return {
        runImageExtraction: async () => ({
          outputPath: '/tmp/output.md',
          markdown: 'hello'
        })
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  resetRequireCache()

  try {
    const { handleImageExtractionEvent } = require('../src/extraction/image/handler')
    const result = await handleImageExtractionEvent({ metadata: { path: '/tmp/image.png' }, flow_id: flowId })
    await flushPromises()

    assert.equal(result.outputPath, '/tmp/output.md')
    assert.equal(toastCalls.length, 1)
    assert.equal(toastCalls[0].type, 'warning')
    assert.equal(toastCalls[0].title, 'Analysis Queue Failed')
  } finally {
    Module._load = originalLoad
    resetRequireCache()
  }
})
