const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')

const MANIFEST_PATH = path.join(__dirname, 'fluid-audio-model-manifest.json')
const DEFAULT_OUTPUT_ROOT = path.join(__dirname, 'bin', 'fluid-audio-models')
const PACKAGED_MANIFEST_FILENAME = 'fluid-audio-model-manifest.json'
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function loadFluidAudioModelManifest (manifestPath = MANIFEST_PATH) {
  return JSON.parse(fsSync.readFileSync(manifestPath, 'utf-8'))
}

function isSafeModelPath (relativePath) {
  return typeof relativePath === 'string' &&
    relativePath.length > 0 &&
    !relativePath.includes('\\') &&
    !path.posix.isAbsolute(relativePath) &&
    path.posix.normalize(relativePath) === relativePath &&
    !relativePath.startsWith('../')
}

function validateFluidAudioModelManifest (manifest) {
  if (manifest?.schemaVersion !== 1) {
    throw new Error('FluidAudio model manifest must use schemaVersion 1.')
  }
  if (!REPOSITORY_PATTERN.test(manifest.repository || '')) {
    throw new Error('FluidAudio model manifest has an invalid repository.')
  }
  if (typeof manifest.revision !== 'string' || !manifest.revision.trim()) {
    throw new Error('FluidAudio model manifest has no pinned revision.')
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(manifest.localDirectory || '')) {
    throw new Error('FluidAudio model manifest has an invalid local directory.')
  }
  if (manifest.license !== 'CC-BY-4.0') {
    throw new Error('FluidAudio model manifest must use CC-BY-4.0.')
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('FluidAudio model manifest must contain files.')
  }

  const seenPaths = new Set()
  for (const file of manifest.files) {
    if (!isSafeModelPath(file?.path)) {
      throw new Error(`FluidAudio manifest contains an unsafe model path: ${file?.path}`)
    }
    if (seenPaths.has(file.path)) {
      throw new Error(`FluidAudio manifest contains a duplicate model path: ${file.path}`)
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      throw new Error(`FluidAudio manifest has an invalid size for ${file.path}.`)
    }
    if (!SHA256_PATTERN.test(file.sha256 || '')) {
      throw new Error(`FluidAudio manifest has an invalid SHA-256 for ${file.path}.`)
    }
    seenPaths.add(file.path)
  }
}

function sha256 (content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

async function installedFileIsValid (filePath, expected) {
  try {
    const stats = await fs.lstat(filePath)
    if (!stats.isFile() || stats.size !== expected.size) {
      return false
    }
    const content = await fs.readFile(filePath)
    return sha256(content) === expected.sha256
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

function modelFileUrl (manifest, relativePath) {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')
  return [
    'https://huggingface.co',
    manifest.repository,
    'resolve',
    encodeURIComponent(manifest.revision),
    encodedPath
  ].join('/')
}

function validateDownloadedFile (file, content) {
  if (content.length !== file.size) {
    throw new Error(
      `FluidAudio model ${file.path} has ${content.length} bytes; expected ${file.size}.`
    )
  }
  if (sha256(content) !== file.sha256) {
    throw new Error(`FluidAudio model ${file.path} failed SHA-256 validation.`)
  }
}

async function writeFileAtomically (destination, content) {
  const temporaryPath = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, content, { flag: 'wx', mode: 0o644 })
    await fs.rename(temporaryPath, destination)
  } catch (error) {
    try {
      await fs.unlink(temporaryPath)
    } catch (cleanupError) {
      if (cleanupError?.code !== 'ENOENT') {
        throw new AggregateError(
          [error, cleanupError],
          `Failed to install FluidAudio model and clean ${temporaryPath}.`
        )
      }
    }
    throw error
  }
}

async function downloadModelFile ({ manifest, file, destination, fetchImpl }) {
  const url = modelFileUrl(manifest, file.path)
  const response = await fetchImpl(url)
  if (!response?.ok) {
    throw new Error(
      `Failed to download FluidAudio model ${file.path}: HTTP ${response?.status ?? 'unknown'}.`
    )
  }
  const content = Buffer.from(await response.arrayBuffer())
  validateDownloadedFile(file, content)
  await writeFileAtomically(destination, content)
}

async function listPackagedFiles (directory, relativeDirectory = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name
    const fullPath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`FluidAudio model bundle contains a symbolic link: ${relativePath}`)
    }
    if (entry.isDirectory()) {
      files.push(...await listPackagedFiles(fullPath, relativePath))
      continue
    }
    if (!entry.isFile()) {
      throw new Error(`FluidAudio model bundle contains an unsupported item: ${relativePath}`)
    }
    files.push(relativePath)
  }
  return files
}

async function validatePackagedInventory ({ manifest, outputRoot }) {
  const expectedFiles = new Set([
    PACKAGED_MANIFEST_FILENAME,
    ...manifest.files.map((file) => `${manifest.localDirectory}/${file.path}`)
  ])
  const installedFiles = new Set(await listPackagedFiles(outputRoot))
  const missingFiles = [...expectedFiles].filter((file) => !installedFiles.has(file)).sort()
  if (missingFiles.length > 0) {
    throw new Error(`FluidAudio model bundle is missing files: ${missingFiles.join(', ')}`)
  }
  const unexpectedFiles = [...installedFiles]
    .filter((file) => !expectedFiles.has(file))
    .sort()
  if (unexpectedFiles.length > 0) {
    throw new Error(
      `FluidAudio model bundle contains unexpected files: ${unexpectedFiles.join(', ')}`
    )
  }
}

async function installFluidAudioModels ({
  manifest = loadFluidAudioModelManifest(),
  outputRoot = DEFAULT_OUTPUT_ROOT,
  fetchImpl = globalThis.fetch
} = {}) {
  validateFluidAudioModelManifest(manifest)
  if (typeof fetchImpl !== 'function') {
    throw new Error('FluidAudio model installation requires the Node.js fetch API.')
  }

  const modelRoot = path.join(outputRoot, manifest.localDirectory)
  let downloadedFiles = 0
  let reusedFiles = 0

  for (const file of manifest.files) {
    const destination = path.join(modelRoot, ...file.path.split('/'))
    if (await installedFileIsValid(destination, file)) {
      reusedFiles += 1
      continue
    }
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o755 })
    await downloadModelFile({ manifest, file, destination, fetchImpl })
    downloadedFiles += 1
  }

  const packagedManifest = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
  await writeFileAtomically(
    path.join(outputRoot, PACKAGED_MANIFEST_FILENAME),
    packagedManifest
  )
  await validatePackagedInventory({ manifest, outputRoot })

  return {
    downloadedFiles,
    reusedFiles,
    totalBytes: manifest.files.reduce((total, file) => total + file.size, 0),
    modelRoot
  }
}

async function run () {
  const result = await installFluidAudioModels()
  console.log(
    `FluidAudio models ready: ${result.modelRoot} ` +
      `(${result.downloadedFiles} downloaded, ${result.reusedFiles} reused)`
  )
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`Failed to prepare FluidAudio models: ${error?.message || String(error)}`)
    process.exitCode = 1
  })
}

module.exports = {
  installFluidAudioModels,
  loadFluidAudioModelManifest,
  validateFluidAudioModelManifest
}
