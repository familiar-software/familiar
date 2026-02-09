const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { createClipboardMirror } = require('../src/clipboard/mirror')
const { JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME } = require('../src/const')

test('clipboard mirror writes on change, skips empty and unchanged text', async () => {
  const saved = []
  const reads = [
    '   ', // empty -> skip
    'hello',
    'hello', // unchanged -> skip
    'world'
  ]
  let readIndex = 0

  const mirror = createClipboardMirror({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    scheduler: {
      setInterval: () => ({ unref: () => {} }),
      clearInterval: () => {}
    },
    readTextImpl: () => reads[Math.min(readIndex++, reads.length - 1)],
    saveImpl: async (text, directory, _date) => {
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
  assert.equal(saved[0].text, 'hello')
  assert.equal(saved[1].text, 'world')
  assert.equal(
    saved[0].directory,
    path.join('/tmp/context', JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME, 'session-123')
  )
})

test('clipboard mirror start validates required inputs', () => {
  const mirror = createClipboardMirror({
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    scheduler: { setInterval: () => ({}), clearInterval: () => {} },
    readTextImpl: () => 'hello',
    saveImpl: async () => ({ path: '/tmp/file' })
  })

  assert.equal(mirror.start({ contextFolderPath: '', sessionId: 'session-123' }).ok, false)
  assert.equal(mirror.start({ contextFolderPath: '/tmp/context', sessionId: '' }).ok, false)
})

