const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  createSessionStore,
  recoverIncompleteSessions
} = require('../src/screen-stills/session-store')

const readManifest = (manifestPath) =>
  JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

const makeTempContext = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-'))
  fs.mkdirSync(root, { recursive: true })
  return root
}

test('stills session store writes manifest and captures', () => {
  const contextFolderPath = makeTempContext()
  const store = createSessionStore({
    contextFolderPath,
    intervalSeconds: 2,
    scale: 0.5,
    format: 'webp',
    sourceDisplay: { id: 1 },
    appVersion: '0.0.0'
  })

  const first = store.nextCaptureFile(new Date('2025-01-01T00:00:00.000Z'))
  store.addCapture({
    fileName: first.fileName,
    capturedAt: first.capturedAt
  })
  store.finalize('idle')

  const manifest = readManifest(store.manifestPath)
  assert.equal(manifest.format, 'webp')
  assert.equal(manifest.scale, 0.5)
  assert.equal(manifest.intervalSeconds, 2)
  assert.equal(manifest.captures.length, 1)
  assert.equal(manifest.captures[0].file, first.fileName)
  assert.equal(manifest.stopReason, 'idle')
  assert.ok(manifest.endedAt)
})

test('recoverIncompleteSessions finalizes unfinished stills manifests', () => {
  const contextFolderPath = makeTempContext()
  const stillsRoot = path.join(contextFolderPath, 'jiminy', 'stills', 'session-test')
  fs.mkdirSync(stillsRoot, { recursive: true })

  const manifestPath = path.join(stillsRoot, 'manifest.json')
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ version: 1, startedAt: '2025-01-01T00:00:00.000Z', captures: [] }, null, 2),
    'utf-8'
  )

  const updated = recoverIncompleteSessions(contextFolderPath)
  assert.equal(updated, 1)

  const manifest = readManifest(manifestPath)
  assert.equal(manifest.stopReason, 'crash')
  assert.ok(manifest.endedAt)
})
