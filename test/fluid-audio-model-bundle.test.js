const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  installFluidAudioModels,
  loadFluidAudioModelManifest,
  validateFluidAudioModelManifest
} = require('../scripts/build-fluid-audio-models')

function sha256 (content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function manifestFor (content) {
  return {
    schemaVersion: 1,
    repository: 'FluidInference/speaker-diarization-coreml',
    revision: 'test-revision',
    localDirectory: 'speaker-diarization',
    license: 'CC-BY-4.0',
    files: [
      {
        path: 'Segmentation.mlmodelc/coremldata.bin',
        size: content.length,
        sha256: sha256(content)
      }
    ]
  }
}

test('checked-in FluidAudio manifest pins the complete 21,599,417-byte asset set', () => {
  const manifest = loadFluidAudioModelManifest()

  validateFluidAudioModelManifest(manifest)
  assert.equal(manifest.revision, '1ed7a662fdc7109e36d822db793ee6eebdaf8594')
  assert.equal(manifest.files.length, 21)
  assert.equal(
    manifest.files.reduce((total, file) => total + file.size, 0),
    21_599_417
  )
})

test('model installer downloads, validates, and reuses a pinned model file', async () => {
  const content = Buffer.from('verified model bytes')
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-fluid-models-'))
  const requestedUrls = []
  const fetchImpl = async (url) => {
    requestedUrls.push(url)
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => content
    }
  }

  const firstResult = await installFluidAudioModels({
    manifest: manifestFor(content),
    outputRoot,
    fetchImpl
  })
  const secondResult = await installFluidAudioModels({
    manifest: manifestFor(content),
    outputRoot,
    fetchImpl
  })

  assert.equal(firstResult.downloadedFiles, 1)
  assert.equal(secondResult.downloadedFiles, 0)
  assert.equal(requestedUrls.length, 1)
  assert.match(requestedUrls[0], /test-revision\/Segmentation\.mlmodelc/)
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(path.join(outputRoot, 'fluid-audio-model-manifest.json'), 'utf-8')
    ),
    manifestFor(content)
  )
  assert.equal(
    fs.readFileSync(
      path.join(
        outputRoot,
        'speaker-diarization',
        'Segmentation.mlmodelc',
        'coremldata.bin'
      )
    ).toString(),
    content.toString()
  )
})

test('model installer rejects files outside the pinned model inventory', async () => {
  const content = Buffer.from('verified model bytes')
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-fluid-models-'))
  fs.writeFileSync(path.join(outputRoot, 'stale-model.bin'), 'stale')

  await assert.rejects(
    installFluidAudioModels({
      manifest: manifestFor(content),
      outputRoot,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => content
      })
    }),
    /unexpected files.*stale-model\.bin/
  )
})

test('model installer rejects symbolic links in its packaged output', async () => {
  const content = Buffer.from('verified model bytes')
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-fluid-models-'))
  const outsideFile = path.join(os.tmpdir(), `familiar-fluid-target-${crypto.randomUUID()}`)
  fs.writeFileSync(outsideFile, 'outside')
  fs.symlinkSync(outsideFile, path.join(outputRoot, 'unexpected-link'))

  try {
    await assert.rejects(
      installFluidAudioModels({
        manifest: manifestFor(content),
        outputRoot,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          arrayBuffer: async () => content
        })
      }),
      /contains a symbolic link.*unexpected-link/
    )
  } finally {
    fs.rmSync(outputRoot, { force: true, recursive: true })
    fs.rmSync(outsideFile, { force: true })
  }
})

test('model installer rejects downloaded content that does not match the manifest', async () => {
  const expected = Buffer.from('expected')
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-fluid-models-'))

  await assert.rejects(
    installFluidAudioModels({
      manifest: manifestFor(expected),
      outputRoot,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('tampered')
      })
    }),
    /failed SHA-256 validation/
  )
  assert.deepEqual(fs.readdirSync(outputRoot), ['speaker-diarization'])
  assert.deepEqual(
    fs.readdirSync(path.join(outputRoot, 'speaker-diarization')),
    ['Segmentation.mlmodelc']
  )
  assert.deepEqual(
    fs.readdirSync(
      path.join(outputRoot, 'speaker-diarization', 'Segmentation.mlmodelc')
    ),
    []
  )
})

test('model manifest rejects traversal paths', () => {
  const content = Buffer.from('model')
  const manifest = manifestFor(content)
  manifest.files[0] = { ...manifest.files[0], path: '../outside.bin' }

  assert.throws(
    () => validateFluidAudioModelManifest(manifest),
    /unsafe model path/
  )
})

test('model manifest rejects duplicate paths', () => {
  const manifest = manifestFor(Buffer.from('model'))
  manifest.files.push({ ...manifest.files[0] })

  assert.throws(
    () => validateFluidAudioModelManifest(manifest),
    /duplicate model path/
  )
})

test('model manifest rejects an unexpected license', () => {
  const manifest = manifestFor(Buffer.from('model'))
  manifest.license = 'unknown'

  assert.throws(
    () => validateFluidAudioModelManifest(manifest),
    /must use CC-BY-4\.0/
  )
})
