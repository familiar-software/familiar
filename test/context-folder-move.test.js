const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const { moveFamiliarFolder } = require('../src/context-folder/move')

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

test('moveFamiliarFolder moves familiar folder contents to destination', async () => {
  const sourceContext = createTempDir('familiar-context-source-')
  const destinationContext = createTempDir('familiar-context-dest-')
  const familiarRoot = path.join(sourceContext, 'familiar')
  fs.mkdirSync(path.join(familiarRoot, 'nested'), { recursive: true })
  fs.writeFileSync(path.join(familiarRoot, 'nested', 'db.sqlite'), 'sqlite-bytes')
  fs.writeFileSync(path.join(familiarRoot, 'notes.txt'), 'hello')

  await moveFamiliarFolder({
    sourceContextFolderPath: sourceContext,
    destinationContextFolderPath: destinationContext,
    logger: { log() {}, warn() {} }
  })

  const destinationFamiliar = path.join(destinationContext, 'familiar')
  assert.equal(fs.existsSync(destinationFamiliar), true)
  assert.equal(fs.existsSync(path.join(destinationFamiliar, 'notes.txt')), true)
  assert.equal(fs.existsSync(path.join(destinationFamiliar, 'nested', 'db.sqlite')), true)
  assert.equal(fs.existsSync(path.join(sourceContext, 'familiar')), false)
})

test('moveFamiliarFolder errors when destination familiar folder exists', async () => {
  const sourceContext = createTempDir('familiar-context-source-')
  const destinationContext = createTempDir('familiar-context-dest-')
  fs.mkdirSync(path.join(sourceContext, 'familiar'), { recursive: true })
  fs.mkdirSync(path.join(destinationContext, 'familiar'), { recursive: true })

  await assert.rejects(
    async () => moveFamiliarFolder({
      sourceContextFolderPath: sourceContext,
      destinationContextFolderPath: destinationContext,
      logger: { log() {}, warn() {} }
    }),
    /Target familiar folder already exists/
  )
})

test('moveFamiliarFolder falls back to copy when rename fails with EXDEV', async () => {
  const sourceContext = createTempDir('familiar-context-source-')
  const destinationContext = createTempDir('familiar-context-dest-')
  const familiarRoot = path.join(sourceContext, 'familiar')
  fs.mkdirSync(familiarRoot, { recursive: true })
  fs.writeFileSync(path.join(familiarRoot, 'notes.txt'), 'hello')

  const originalRename = fs.promises.rename
  fs.promises.rename = async () => {
    const error = new Error('EXDEV: cross-device link not permitted')
    error.code = 'EXDEV'
    throw error
  }

  try {
    const result = await moveFamiliarFolder({
      sourceContextFolderPath: sourceContext,
      destinationContextFolderPath: destinationContext,
      logger: { log() {}, warn() {} }
    })

    assert.equal(result.method, 'copy')
    assert.equal(fs.existsSync(path.join(destinationContext, 'familiar', 'notes.txt')), true)
    assert.equal(fs.existsSync(path.join(sourceContext, 'familiar')), false)
  } finally {
    fs.promises.rename = originalRename
  }
})
