const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs/promises')

const {
  buildClipboardMirrorFilename,
  buildClipboardImageMirrorFilename,
  getClipboardMirrorDirectory,
  getClipboardImageMirrorDirectory,
  saveClipboardImageMirrorToDirectory,
  saveClipboardMirrorToDirectory
} = require('../src/clipboard/storage')
const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../src/const')

test('buildClipboardMirrorFilename uses a stable timestamp format with clipboard suffix', () => {
  const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6))
  const filename = buildClipboardMirrorFilename(date)

  assert.equal(filename, '2026-01-02T03-04-05-006Z.clipboard.txt')
})

test('buildClipboardImageMirrorFilename uses a stable timestamp format with clipboard suffix', () => {
  const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6))
  const filename = buildClipboardImageMirrorFilename({ date, extension: 'png' })

  assert.equal(filename, '2026-01-02T03-04-05-006Z.clipboard.png')
})

test('clipboard filename timestamp prefix matches markdown filename timestamp prefix', () => {
  const date = new Date(Date.UTC(2026, 1, 17, 12, 34, 56, 789))
  const timestampPrefix = date.toISOString().replace(/[:.]/g, '-')
  const clipboardFilename = buildClipboardMirrorFilename(date)
  const markdownFilename = `${timestampPrefix}.md`

  assert.equal(clipboardFilename, `${timestampPrefix}.clipboard.txt`)
  assert.equal(clipboardFilename.split('.clipboard.txt')[0], markdownFilename.replace(/\.md$/, ''))
})

test('getClipboardMirrorDirectory returns a path under the context folder and session', () => {
  const dir = getClipboardMirrorDirectory({ contextFolderPath: '/tmp/context', sessionId: 'session-123' })
  assert.equal(
    dir,
    path.join('/tmp/context', FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME, 'session-123')
  )
})

test('getClipboardImageMirrorDirectory returns a path under the context folder and session', () => {
  const dir = getClipboardImageMirrorDirectory({ contextFolderPath: '/tmp/context', sessionId: 'session-123' })
  assert.equal(
    dir,
    path.join('/tmp/context', FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME, 'session-123')
  )
})

test('getClipboardMirrorDirectory returns null without a context folder or session id', () => {
  assert.equal(getClipboardMirrorDirectory({ contextFolderPath: '', sessionId: 'session-123' }), null)
  assert.equal(getClipboardMirrorDirectory({ contextFolderPath: null, sessionId: 'session-123' }), null)
  assert.equal(getClipboardMirrorDirectory({ contextFolderPath: '/tmp/context', sessionId: '' }), null)
  assert.equal(getClipboardMirrorDirectory({ contextFolderPath: '/tmp/context', sessionId: null }), null)
})

test('getClipboardImageMirrorDirectory returns null without a context folder or session id', () => {
  assert.equal(getClipboardImageMirrorDirectory({ contextFolderPath: '', sessionId: 'session-123' }), null)
  assert.equal(getClipboardImageMirrorDirectory({ contextFolderPath: null, sessionId: 'session-123' }), null)
  assert.equal(getClipboardImageMirrorDirectory({ contextFolderPath: '/tmp/context', sessionId: '' }), null)
  assert.equal(getClipboardImageMirrorDirectory({ contextFolderPath: '/tmp/context', sessionId: null }), null)
})

test('saveClipboardMirrorToDirectory writes text to the target directory', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-clipboard-'))
  const nestedDir = path.join(tempDir, 'nested')
  const text = 'Test clipboard content\nwith multiple lines'
  const date = new Date(2026, 0, 2, 3, 4, 5, 6)

  const result = await saveClipboardMirrorToDirectory({ text, directory: nestedDir, date })

  assert.ok(result.path.startsWith(nestedDir))
  assert.ok(result.path.endsWith('.clipboard.txt'))
  assert.ok(result.filename.endsWith('.clipboard.txt'))
  const content = await fs.readFile(result.path, 'utf-8')
  assert.equal(content, text)
})

test('saveClipboardMirrorToDirectory applies redaction before writing', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-clipboard-redaction-'))
  const nestedDir = path.join(tempDir, 'nested')
  const text = 'api_key=sk-123456789012345678901234'

  const result = await saveClipboardMirrorToDirectory({
    text,
    directory: nestedDir,
    date: new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6)),
    options: {
      scanAndRedactContentImpl: async () => ({
        content: 'api_key=[REDACTED:openai_sk]',
        findings: 1,
        ruleCounts: { openai_sk: 1 },
        redactionBypassed: false
      })
    }
  })

  const content = await fs.readFile(result.path, 'utf-8')
  assert.equal(content, 'api_key=[REDACTED:openai_sk]')
})

test('saveClipboardMirrorToDirectory calls warning callback when redaction is bypassed', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-clipboard-redaction-warning-'))
  const warnings = []

  await saveClipboardMirrorToDirectory({
    text: 'token=abc123456789012345678901234567',
    directory: tempDir,
    date: new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6)),
    options: {
      scanAndRedactContentImpl: async ({ onRedactionWarning }) => {
        onRedactionWarning({ code: 'rg-redaction-unavailable', message: 'stub warning' })
        return {
          content: 'token=abc123456789012345678901234567',
          findings: 0,
          ruleCounts: {},
          redactionBypassed: true
        }
      },
      onRedactionWarning: (warning) => warnings.push(warning)
    }
  })

  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].code, 'rg-redaction-unavailable')
})

test('saveClipboardMirrorToDirectory stores clipboard under the context stills-markdown session folder', async () => {
  const contextDir = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-context-clipboard-'))
  const clipboardDir = getClipboardMirrorDirectory({ contextFolderPath: contextDir, sessionId: 'session-abc' })
  const text = 'Clipboard content for context folder test'
  const date = new Date(2026, 0, 2, 3, 4, 5, 6)

  const result = await saveClipboardMirrorToDirectory({ text, directory: clipboardDir, date })

  assert.equal(path.dirname(result.path), clipboardDir)
})

test('saveClipboardImageMirrorToDirectory writes image to the target directory', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-clipboard-image-'))
  const nestedDir = path.join(tempDir, 'nested')
  const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6))

  const result = await saveClipboardImageMirrorToDirectory({
    imageBuffer,
    directory: nestedDir,
    options: { date, extension: 'png' }
  })

  assert.ok(result.path.startsWith(nestedDir))
  assert.ok(result.path.endsWith('.clipboard.png'))
  assert.ok(result.filename.endsWith('.clipboard.png'))
  assert.equal(result.capturedAt, date.toISOString())
  const content = await fs.readFile(result.path)
  assert.deepEqual(content, imageBuffer)
})

test('saveClipboardImageMirrorToDirectory stores clipboard image under context stills session folder', async () => {
  const contextDir = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-context-clipboard-image-'))
  const imageDir = getClipboardImageMirrorDirectory({ contextFolderPath: contextDir, sessionId: 'session-abc' })
  const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6))

  const result = await saveClipboardImageMirrorToDirectory({
    imageBuffer,
    directory: imageDir,
    options: { date, extension: 'png' }
  })

  assert.equal(path.dirname(result.path), imageDir)
})

test('saveClipboardMirrorToDirectory throws on invalid text', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-clipboard-invalid-'))

  await assert.rejects(
    saveClipboardMirrorToDirectory({ text: null, directory: tempDir }),
    { message: 'Clipboard text is missing or invalid.' }
  )

  await assert.rejects(
    saveClipboardMirrorToDirectory({ text: undefined, directory: tempDir }),
    { message: 'Clipboard text is missing or invalid.' }
  )
})

test('saveClipboardMirrorToDirectory throws on missing directory', async () => {
  await assert.rejects(
    saveClipboardMirrorToDirectory({ text: 'test content', directory: null }),
    { message: 'Clipboard mirror directory is missing.' }
  )

  await assert.rejects(
    saveClipboardMirrorToDirectory({ text: 'test content', directory: '' }),
    { message: 'Clipboard mirror directory is missing.' }
  )
})

test('saveClipboardImageMirrorToDirectory throws on invalid image', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'familiar-clipboard-image-invalid-'))

  await assert.rejects(
    saveClipboardImageMirrorToDirectory({ imageBuffer: null, directory: tempDir }),
    { message: 'Clipboard image is missing or invalid.' }
  )

  await assert.rejects(
    saveClipboardImageMirrorToDirectory({ imageBuffer: Buffer.alloc(0), directory: tempDir }),
    { message: 'Clipboard image is missing or invalid.' }
  )
})

test('saveClipboardImageMirrorToDirectory throws on missing directory', async () => {
  await assert.rejects(
    saveClipboardImageMirrorToDirectory({ imageBuffer: Buffer.from([1, 2, 3]), directory: null }),
    { message: 'Clipboard image mirror directory is missing.' }
  )

  await assert.rejects(
    saveClipboardImageMirrorToDirectory({ imageBuffer: Buffer.from([1, 2, 3]), directory: '' }),
    { message: 'Clipboard image mirror directory is missing.' }
  )
})
