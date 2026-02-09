const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs/promises')

const {
  buildClipboardMirrorFilename,
  getClipboardMirrorDirectory,
  saveClipboardMirrorToDirectory
} = require('../src/clipboard/storage')
const {
  JIMINY_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../src/const')

test('buildClipboardMirrorFilename uses a stable timestamp format with clipboard suffix', () => {
  const date = new Date(2026, 0, 2, 3, 4, 5, 6)
  const filename = buildClipboardMirrorFilename(date)

  assert.equal(filename, '2026-01-02_03-04-05-006.clipboard.txt')
})

test('getClipboardMirrorDirectory returns a path under the context folder and session', () => {
  const dir = getClipboardMirrorDirectory('/tmp/context', 'session-123')
  assert.equal(
    dir,
    path.join('/tmp/context', JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME, 'session-123')
  )
})

test('getClipboardMirrorDirectory returns null without a context folder or session id', () => {
  assert.equal(getClipboardMirrorDirectory('', 'session-123'), null)
  assert.equal(getClipboardMirrorDirectory(null, 'session-123'), null)
  assert.equal(getClipboardMirrorDirectory('/tmp/context', ''), null)
  assert.equal(getClipboardMirrorDirectory('/tmp/context', null), null)
})

test('saveClipboardMirrorToDirectory writes text to the target directory', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-clipboard-'))
  const nestedDir = path.join(tempDir, 'nested')
  const text = 'Test clipboard content\nwith multiple lines'
  const date = new Date(2026, 0, 2, 3, 4, 5, 6)

  const result = await saveClipboardMirrorToDirectory(text, nestedDir, date)

  assert.ok(result.path.startsWith(nestedDir))
  assert.ok(result.path.endsWith('.clipboard.txt'))
  assert.ok(result.filename.endsWith('.clipboard.txt'))
  const content = await fs.readFile(result.path, 'utf-8')
  assert.equal(content, text)
})

test('saveClipboardMirrorToDirectory stores clipboard under the context stills-markdown session folder', async () => {
  const contextDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-context-clipboard-'))
  const clipboardDir = getClipboardMirrorDirectory(contextDir, 'session-abc')
  const text = 'Clipboard content for context folder test'
  const date = new Date(2026, 0, 2, 3, 4, 5, 6)

  const result = await saveClipboardMirrorToDirectory(text, clipboardDir, date)

  assert.equal(path.dirname(result.path), clipboardDir)
})

test('saveClipboardMirrorToDirectory throws on invalid text', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-clipboard-invalid-'))

  await assert.rejects(
    saveClipboardMirrorToDirectory(null, tempDir),
    { message: 'Clipboard text is missing or invalid.' }
  )

  await assert.rejects(
    saveClipboardMirrorToDirectory(undefined, tempDir),
    { message: 'Clipboard text is missing or invalid.' }
  )
})

test('saveClipboardMirrorToDirectory throws on missing directory', async () => {
  await assert.rejects(
    saveClipboardMirrorToDirectory('test content', null),
    { message: 'Clipboard mirror directory is missing.' }
  )

  await assert.rejects(
    saveClipboardMirrorToDirectory('test content', ''),
    { message: 'Clipboard mirror directory is missing.' }
  )
})
