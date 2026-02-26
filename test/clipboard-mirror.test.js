const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { createClipboardMirror } = require('../src/clipboard/mirror')
const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME } = require('../src/const')

test('clipboard mirror writes on change, skips empty and unchanged text', async () => {
  const saved = []
  const queueStub = { enqueueCapture: () => {}, close: () => {} }
  const reads = [
    '   ', // empty -> skip
    'hello there',
    'hello there', // unchanged -> skip
    'world now'
  ]
  let readIndex = 0

  const mirror = createClipboardMirror({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    scheduler: {
      setInterval: () => ({ unref: () => {} }),
      clearInterval: () => {}
    },
    readImageImpl: () => null,
    readTextImpl: () => reads[Math.min(readIndex++, reads.length - 1)],
    saveTextImpl: async ({ text, directory }) => {
      saved.push({ text, directory })
      return { path: path.join(directory, 'dummy.clipboard.txt') }
    },
    createQueueImpl: () => queueStub
  })

  const startResult = mirror.start({ contextFolderPath: '/tmp/context', sessionId: 'session-123' })
  assert.equal(startResult.ok, true)

  await mirror.tick()
  await mirror.tick()
  await mirror.tick()
  await mirror.tick()

  assert.equal(saved.length, 2)
  assert.equal(saved[0].text, 'hello there')
  assert.equal(saved[1].text, 'world now')
  assert.equal(
    saved[0].directory,
    path.join('/tmp/context', FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME, 'session-123')
  )
})

test('clipboard mirror skips one-word clipboard values and still mirrors multi-word text', async () => {
  const saved = []
  const queueStub = { enqueueCapture: () => {}, close: () => {} }
  const reads = [
    'password123',
    'password123',
    'two words',
    'two words'
  ]
  let readIndex = 0

  const mirror = createClipboardMirror({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    scheduler: {
      setInterval: () => ({ unref: () => {} }),
      clearInterval: () => {}
    },
    readImageImpl: () => null,
    readTextImpl: () => reads[Math.min(readIndex++, reads.length - 1)],
    saveTextImpl: async ({ text, directory }) => {
      saved.push({ text, directory })
      return { path: path.join(directory, 'dummy.clipboard.txt') }
    },
    createQueueImpl: () => queueStub
  })

  const startResult = mirror.start({ contextFolderPath: '/tmp/context', sessionId: 'session-123' })
  assert.equal(startResult.ok, true)

  const firstTick = await mirror.tick()
  const secondTick = await mirror.tick()
  const thirdTick = await mirror.tick()
  const fourthTick = await mirror.tick()

  assert.deepEqual(firstTick, { ok: true, skipped: true, reason: 'single-word' })
  assert.deepEqual(secondTick, { ok: true, skipped: true, reason: 'unchanged' })
  assert.equal(thirdTick.ok, true)
  assert.equal(typeof thirdTick.path, 'string')
  assert.deepEqual(fourthTick, { ok: true, skipped: true, reason: 'unchanged' })

  assert.equal(saved.length, 1)
  assert.equal(saved[0].text, 'two words')
  assert.equal(
    saved[0].directory,
    path.join('/tmp/context', FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME, 'session-123')
  )
})

test('clipboard mirror start validates required inputs', () => {
  const mirror = createClipboardMirror({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    scheduler: { setInterval: () => ({}), clearInterval: () => {} },
    readImageImpl: () => null,
    readTextImpl: () => 'hello',
    saveTextImpl: async () => ({ path: '/tmp/file' }),
    createQueueImpl: () => ({ enqueueCapture: () => {}, close: () => {} })
  })

  assert.equal(mirror.start({ contextFolderPath: '', sessionId: 'session-123' }).ok, false)
  assert.equal(mirror.start({ contextFolderPath: '/tmp/context', sessionId: '' }).ok, false)
})

test('clipboard mirror saves clipboard images into stills session and enqueues capture', async () => {
  const savedImages = []
  const queued = []
  let readTextCalls = 0

  const mirror = createClipboardMirror({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    scheduler: { setInterval: () => ({ unref: () => {} }), clearInterval: () => {} },
    readImageImpl: () => ({ buffer: Buffer.from('image-one'), extension: 'png' }),
    readTextImpl: () => {
      readTextCalls += 1
      return 'should-not-be-read'
    },
    saveImageImpl: async ({ imageBuffer, directory, options: { date, extension } = {} } = {}) => {
      savedImages.push({ imageBuffer, directory, extension })
      return {
        path: path.join(directory, 'saved.clipboard.png'),
        filename: 'saved.clipboard.png',
        capturedAt: date.toISOString()
      }
    },
    createQueueImpl: () => ({
      enqueueCapture: (payload) => queued.push(payload),
      close: () => {}
    })
  })

  const startResult = mirror.start({ contextFolderPath: '/tmp/context', sessionId: 'session-123' })
  assert.equal(startResult.ok, true)
  const tickResult = await mirror.tick()

  assert.equal(tickResult.ok, true)
  assert.equal(tickResult.type, 'image')
  assert.equal(savedImages.length, 1)
  assert.equal(queued.length, 1)
  assert.equal(savedImages[0].extension, 'png')
  assert.equal(
    savedImages[0].directory,
    path.join('/tmp/context', 'familiar', 'stills', 'session-123')
  )
  assert.equal(queued[0].sessionId, 'session-123')
  assert.equal(queued[0].imagePath, path.join('/tmp/context', 'familiar', 'stills', 'session-123', 'saved.clipboard.png'))
  assert.equal(readTextCalls, 0)
})

test('clipboard mirror skips unchanged clipboard images', async () => {
  const queued = []
  const mirror = createClipboardMirror({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    scheduler: { setInterval: () => ({ unref: () => {} }), clearInterval: () => {} },
    readImageImpl: () => ({ buffer: Buffer.from('same-image'), extension: 'png' }),
    readTextImpl: () => 'ignored text',
    saveImageImpl: async ({ imageBuffer, directory, options: { date, extension } = {} } = {}) => ({
      path: path.join(directory, `saved-${imageBuffer.length}.clipboard.${extension}`),
      filename: `saved-${imageBuffer.length}.clipboard.${extension}`,
      capturedAt: date.toISOString()
    }),
    createQueueImpl: () => ({
      enqueueCapture: (payload) => queued.push(payload),
      close: () => {}
    })
  })

  const startResult = mirror.start({ contextFolderPath: '/tmp/context', sessionId: 'session-123' })
  assert.equal(startResult.ok, true)

  const firstTick = await mirror.tick()
  const secondTick = await mirror.tick()

  assert.equal(firstTick.ok, true)
  assert.equal(firstTick.type, 'image')
  assert.deepEqual(secondTick, { ok: true, skipped: true, reason: 'unchanged-image' })
  assert.equal(queued.length, 1)
})

test('clipboard mirror falls back to text when clipboard image is empty', async () => {
  const savedTexts = []
  const mirror = createClipboardMirror({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    scheduler: { setInterval: () => ({ unref: () => {} }), clearInterval: () => {} },
    readImageImpl: () => ({ isEmpty: () => true }),
    readTextImpl: () => 'hello from text fallback',
    saveTextImpl: async ({ text, directory }) => {
      savedTexts.push({ text, directory })
      return { path: path.join(directory, 'fallback.clipboard.txt') }
    },
    createQueueImpl: () => ({ enqueueCapture: () => {}, close: () => {} })
  })

  const startResult = mirror.start({ contextFolderPath: '/tmp/context', sessionId: 'session-123' })
  assert.equal(startResult.ok, true)
  const tickResult = await mirror.tick()

  assert.equal(tickResult.ok, true)
  assert.equal(tickResult.path, path.join('/tmp/context', 'familiar', 'stills-markdown', 'session-123', 'fallback.clipboard.txt'))
  assert.equal(savedTexts.length, 1)
  assert.equal(savedTexts[0].text, 'hello from text fallback')
})
