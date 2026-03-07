const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { createClipboardMirror } = require('../src/clipboard/mirror')
const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME } = require('../src/const')

test('clipboard mirror writes on change, skips empty and unchanged text', async () => {
  const saved = []
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
    readTextImpl: () => reads[Math.min(readIndex++, reads.length - 1)],
    saveTextImpl: async ({ text, directory }) => {
      saved.push({ text, directory })
      return { path: path.join(directory, 'dummy.clipboard.txt') }
    }
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
    readTextImpl: () => reads[Math.min(readIndex++, reads.length - 1)],
    saveTextImpl: async ({ text, directory }) => {
      saved.push({ text, directory })
      return { path: path.join(directory, 'dummy.clipboard.txt') }
    }
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
    readTextImpl: () => 'hello',
    saveTextImpl: async () => ({ path: '/tmp/file' })
  })

  assert.equal(mirror.start({ contextFolderPath: '', sessionId: 'session-123' }).ok, false)
  assert.equal(mirror.start({ contextFolderPath: '/tmp/context', sessionId: '' }).ok, false)
})

test('clipboard mirror does not save one-word text repeatedly after a later multi-word capture', async () => {
  const saved = []
  const reads = [
    'password123',
    'two words',
    'password123',
    'password123'
  ]
  let readIndex = 0

  const mirror = createClipboardMirror({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    scheduler: { setInterval: () => ({ unref: () => {} }), clearInterval: () => {} },
    readTextImpl: () => reads[Math.min(readIndex++, reads.length - 1)],
    saveTextImpl: async ({ text, directory }) => {
      saved.push({ text, directory })
      return { path: path.join(directory, `${saved.length}.clipboard.txt`) }
    }
  })

  const startResult = mirror.start({ contextFolderPath: '/tmp/context', sessionId: 'session-123' })
  assert.equal(startResult.ok, true)
  const firstTick = await mirror.tick()
  const secondTick = await mirror.tick()
  const thirdTick = await mirror.tick()
  const fourthTick = await mirror.tick()

  assert.deepEqual(firstTick, { ok: true, skipped: true, reason: 'single-word' })
  assert.equal(secondTick.ok, true)
  assert.equal(typeof secondTick.path, 'string')
  assert.deepEqual(thirdTick, { ok: true, skipped: true, reason: 'single-word' })
  assert.deepEqual(fourthTick, { ok: true, skipped: true, reason: 'unchanged' })
  assert.equal(saved.length, 1)
  assert.equal(saved[0].text, 'two words')
})
