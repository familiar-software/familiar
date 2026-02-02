const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { processVideoWithGemini } = require('../../src/recording-query/gemini')

const makeResponse = ({ ok = true, status = 200, headers = {}, jsonData, textData = '' }) => ({
  ok,
  status,
  headers: {
    get: (name) => {
      const key = name.toLowerCase()
      return headers[key] || headers[name]
    }
  },
  json: async () => jsonData,
  text: async () => textData
})

test('processVideoWithGemini returns answer text', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-gemini-'))
  const videoPath = path.join(dir, 'video.mp4')
  fs.writeFileSync(videoPath, 'test')

  const originalFetch = global.fetch
  global.fetch = async (url, options = {}) => {
    if (options.body && typeof options.body.resume === 'function') {
      options.body.resume()
    }
    if (url === 'https://generativelanguage.googleapis.com/upload/v1beta/files') {
      return makeResponse({
        ok: true,
        status: 200,
        headers: { 'x-goog-upload-url': 'https://upload-url' }
      })
    }
    if (url === 'https://upload-url') {
      return makeResponse({
        ok: true,
        status: 200,
        jsonData: {
          file: {
            name: 'files/abc123',
            uri: 'https://file-uri',
            mimeType: 'video/mp4',
            state: 'ACTIVE'
          }
        }
      })
    }
    if (String(url).includes(':generateContent')) {
      return makeResponse({
        ok: true,
        status: 200,
        jsonData: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Answer text' }]
              }
            }
          ],
          usage_metadata: {
            prompt_token_count: 1,
            candidates_token_count: 2,
            total_token_count: 3
          }
        }
      })
    }
    if (String(url).includes('/files/')) {
      return makeResponse({
        ok: true,
        status: 200,
        jsonData: {
          name: 'files/abc123',
          uri: 'https://file-uri',
          mimeType: 'video/mp4',
          state: 'ACTIVE'
        }
      })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }

  const result = await processVideoWithGemini({
    videoPath,
    question: 'What happened?',
    apiKey: 'fake-key',
    pollInterval: 0.01,
    maxWaitSeconds: 1
  })

  global.fetch = originalFetch

  assert.equal(result.ok, true)
  assert.equal(result.answerText, 'Answer text')
})
