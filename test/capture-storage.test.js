const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs/promises')

const { buildCaptureFilename, getCaptureDirectory, savePngToDirectory } = require('../screenshot/capture-storage')
const { CAPTURE_FILENAME_PREFIX, CAPTURES_DIR_NAME } = require('../const')

test('buildCaptureFilename uses a stable timestamp format', () => {
  const date = new Date(2026, 0, 2, 3, 4, 5, 6)
  const filename = buildCaptureFilename(date)

  assert.equal(filename, `${CAPTURE_FILENAME_PREFIX} 2026-01-02_03-04-05-006.png`)
})

test('savePngToDirectory writes to the target directory', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-capture-'))
  const nestedDir = path.join(tempDir, 'nested')
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const date = new Date(2026, 0, 2, 3, 4, 5, 6)

  const result = await savePngToDirectory(buffer, nestedDir, date)

  assert.ok(result.path.startsWith(nestedDir))
  const data = await fs.readFile(result.path)
  assert.deepEqual([...data], [...buffer])
})

test('savePngToDirectory stores captures under the context captures folder', async () => {
  const contextDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-context-'))
  const captureDir = getCaptureDirectory(contextDir)
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const date = new Date(2026, 0, 2, 3, 4, 5, 6)

  const result = await savePngToDirectory(buffer, captureDir, date)

  assert.equal(path.dirname(result.path), captureDir)
})

test('getCaptureDirectory returns a path under the context folder', () => {
  const dir = getCaptureDirectory('/tmp/context')
  assert.equal(dir, path.join('/tmp/context', CAPTURES_DIR_NAME))
})

test('getCaptureDirectory returns null without a context folder', () => {
  assert.equal(getCaptureDirectory(''), null)
  assert.equal(getCaptureDirectory(null), null)
})
