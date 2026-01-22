const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { JsonContextGraphStore, syncContextGraph } = require('../context-graph')
const { CAPTURES_DIR_NAME, EXTRA_CONTEXT_SUFFIX } = require('../const')

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))
const toPosix = (value) => value.split(path.sep).join('/')

const writeFixtureFiles = (rootPath) => {
  fs.mkdirSync(path.join(rootPath, 'sub'), { recursive: true })
  fs.writeFileSync(path.join(rootPath, 'alpha.md'), 'Alpha file content', 'utf-8')
  fs.writeFileSync(path.join(rootPath, 'sub', 'beta.txt'), 'Beta file content', 'utf-8')
}

const writeCycleFixture = (rootPath) => {
  const subPath = path.join(rootPath, 'sub')
  fs.mkdirSync(subPath, { recursive: true })
  fs.writeFileSync(path.join(subPath, 'gamma.txt'), 'Gamma file content', 'utf-8')
  fs.symlinkSync(rootPath, path.join(subPath, 'loop'), 'dir')
}

const writeManyFilesFixture = (rootPath, count) => {
  for (let i = 0; i < count; i += 1) {
    fs.writeFileSync(path.join(rootPath, `file-${i}.txt`), `File ${i} content`, 'utf-8')
  }
}

const writeJsMdFixture = (rootPath) => {
  for (let i = 0; i < 7; i += 1) {
    fs.writeFileSync(path.join(rootPath, `script-${i}.js`), `console.log(${i})`, 'utf-8')
  }

  for (let i = 0; i < 2; i += 1) {
    fs.writeFileSync(path.join(rootPath, `note-${i}.md`), `Note ${i}`, 'utf-8')
  }
}

const writeSkipFixture = (rootPath) => {
  fs.mkdirSync(path.join(rootPath, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(rootPath, 'docs', 'keep.md'), '# Keep', 'utf-8')
  fs.writeFileSync(path.join(rootPath, 'notes.txt'), 'Keep this too', 'utf-8')
  fs.writeFileSync(path.join(rootPath, 'image.png'), 'not really png', 'utf-8')
}

const writeCaptureFolderFixture = (rootPath) => {
  const capturesPath = path.join(rootPath, CAPTURES_DIR_NAME)
  fs.mkdirSync(capturesPath, { recursive: true })
  fs.writeFileSync(path.join(capturesPath, 'capture.md'), 'Captured content', 'utf-8')
}

const writeExtraContextFolderFixture = (rootPath) => {
  const extraFolder = path.join(rootPath, `notes-${EXTRA_CONTEXT_SUFFIX}`)
  fs.mkdirSync(extraFolder, { recursive: true })
  fs.writeFileSync(path.join(extraFolder, 'analysis.md'), 'Generated analysis', 'utf-8')
}

const writeHiddenFolderFixture = (rootPath) => {
  const hiddenFolder = path.join(rootPath, '.git')
  fs.mkdirSync(hiddenFolder, { recursive: true })
  fs.writeFileSync(path.join(hiddenFolder, 'config.md'), 'Hidden config', 'utf-8')
}

const writeScopedGitignoreFixture = (rootPath) => {
  const folderA = path.join(rootPath, 'A')
  const folderB = path.join(rootPath, 'B')

  fs.mkdirSync(path.join(folderA, 'abc'), { recursive: true })
  fs.mkdirSync(path.join(folderA, 'cache'), { recursive: true })
  fs.mkdirSync(path.join(folderA, 'root-only'), { recursive: true })
  fs.mkdirSync(path.join(folderA, 'sub', 'root-only'), { recursive: true })
  fs.mkdirSync(path.join(folderB, 'abc'), { recursive: true })

  fs.writeFileSync(
    path.join(folderA, '.gitignore'),
    [
      '# ignore abc at folder A root',
      '/abc',
      'cache/',
      '*.md',
      '!keep.md',
      '/root-only'
    ].join('\n'),
    'utf-8'
  )

  fs.writeFileSync(path.join(folderA, 'abc', 'ignored.md'), 'Ignored by /abc', 'utf-8')
  fs.writeFileSync(path.join(folderA, 'cache', 'ignored.txt'), 'Ignored by cache/', 'utf-8')
  fs.writeFileSync(path.join(folderA, 'root-only', 'ignored.txt'), 'Ignored by /root-only', 'utf-8')
  fs.writeFileSync(path.join(folderA, 'sub', 'root-only', 'kept.txt'), 'Should be kept', 'utf-8')
  fs.writeFileSync(path.join(folderA, 'keep.md'), 'Should be kept', 'utf-8')
  fs.writeFileSync(path.join(folderA, 'ignore.md'), 'Ignored by *.md', 'utf-8')
  fs.writeFileSync(path.join(folderA, 'sub', 'keep.md'), 'Should be kept', 'utf-8')
  fs.writeFileSync(path.join(folderA, 'note.txt'), 'Should be kept', 'utf-8')

  fs.writeFileSync(path.join(folderB, 'abc', 'keep.md'), 'Should be kept', 'utf-8')
  fs.writeFileSync(path.join(folderB, 'ignore.md'), 'Should be kept', 'utf-8')
}
const createStore = () => {
  const settingsDir = createTempDir('jiminy-settings-')
  return new JsonContextGraphStore({ settingsDir })
}

test('sync builds a context graph and persists json', async () => {
  const contextRoot = createTempDir('jiminy-context-')
  writeFixtureFiles(contextRoot)

  const store = createStore()
  const calls = { files: 0, folders: 0 }
  const summarizer = {
    model: 'test-model',
    summarizeFile: async ({ relativePath }) => {
      calls.files += 1
      return `Summary for ${relativePath}`
    },
    summarizeFolder: async ({ relativePath }) => {
      calls.folders += 1
      return `Folder summary for ${relativePath || '.'}`
    }
  }

  const result = await syncContextGraph({
    rootPath: contextRoot,
    store,
    summarizer
  })

  assert.equal(result.graph.counts.files, 2)
  assert.equal(result.graph.counts.folders, 2)
  assert.ok(fs.existsSync(store.getPath()))
  assert.equal(calls.files, 2)
  assert.equal(calls.folders, 2)

  const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'))
  const fileNode = Object.values(stored.nodes).find((node) => node.type === 'file' && node.relativePath === 'alpha.md')
  assert.ok(fileNode)
  assert.ok(fileNode.contentHash)
  assert.ok(fileNode.summary)
})

test('sync reuses file summaries when content hash is unchanged', async () => {
  const contextRoot = createTempDir('jiminy-context-')
  writeFixtureFiles(contextRoot)

  const store = createStore()
  const summarizer = {
    model: 'test-model',
    summarizeFile: async ({ relativePath }) => `Initial summary for ${relativePath}`,
    summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`
  }

  await syncContextGraph({
    rootPath: contextRoot,
    store,
    summarizer
  })

  const noFileSummaries = {
    model: 'test-model',
    summarizeFile: async () => {
      throw new Error('summarizeFile should not be called for unchanged files')
    },
    summarizeFolder: async ({ relativePath }) => `Updated folder summary for ${relativePath || '.'}`
  }

  const result = await syncContextGraph({
    rootPath: contextRoot,
    store,
    summarizer: noFileSummaries
  })

  assert.equal(result.graph.counts.files, 2)
  assert.equal(result.graph.counts.folders, 2)
})

test('sync warns on directory cycles and avoids recursion', async () => {
  const contextRoot = createTempDir('jiminy-context-')
  writeCycleFixture(contextRoot)

  const store = createStore()
  const summarizer = {
    model: 'test-model',
    summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
    summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`
  }

  const result = await syncContextGraph({
    rootPath: contextRoot,
    store,
    summarizer
  })

  assert.ok(Array.isArray(result.warnings))
  assert.ok(result.warnings.length > 0)
  assert.match(result.warnings[0].path, /loop/)
})

test('sync fails when MAX_NODES is exceeded', async () => {
  const contextRoot = createTempDir('jiminy-context-')
  writeManyFilesFixture(contextRoot, 10)

  const store = createStore()
  const summarizer = {
    model: 'test-model',
    summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
    summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`
  }

  await assert.rejects(
    syncContextGraph({
      rootPath: contextRoot,
      store,
      summarizer,
      maxNodes: 5
    }),
    /MAX_NODES/
  )
})

test('sync ignores unsupported files when MAX_NODES is low', async () => {
  const contextRoot = createTempDir('jiminy-context-')
  writeJsMdFixture(contextRoot)

  const store = createStore()
  const summarizer = {
    model: 'test-model',
    summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
    summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`
  }

  const result = await syncContextGraph({
    rootPath: contextRoot,
    store,
    summarizer,
    maxNodes: 5
  })

  assert.equal(result.graph.counts.files, 2)
  assert.equal(result.graph.counts.folders, 1)
})

test('sync skips non-md/txt files and logs a warning', async () => {
  const contextRoot = createTempDir('jiminy-context-')
  writeSkipFixture(contextRoot)

  const store = createStore()
  const summarizer = {
    model: 'test-model',
    summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
    summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`
  }

  const logs = []
  const logger = {
    log: (message, meta) => logs.push({ message, meta }),
    warn: () => {},
    error: () => {}
  }

  const result = await syncContextGraph({
    rootPath: contextRoot,
    store,
    summarizer,
    logger
  })

  assert.equal(result.graph.counts.files, 2)
  assert.ok(logs.some((entry) => entry.message === 'Skipping unsupported file'))

  const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'))
  const skipped = Object.values(stored.nodes).find((node) => node.relativePath === 'image.png')
  assert.equal(skipped, undefined)
})

test('sync ignores the captures folder', async () => {
  const contextRoot = createTempDir('jiminy-context-')
  writeFixtureFiles(contextRoot)
  writeCaptureFolderFixture(contextRoot)

  const store = createStore()
  const summarizer = {
    model: 'test-model',
    summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
    summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`
  }

  const result = await syncContextGraph({
    rootPath: contextRoot,
    store,
    summarizer
  })

  assert.equal(result.graph.counts.files, 2)
  const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'))
  const capturedNode = Object.values(stored.nodes).find((node) => node.relativePath === path.join(CAPTURES_DIR_NAME, 'capture.md'))
  assert.equal(capturedNode, undefined)
})

test('sync ignores jiminy extra context folders', async () => {
  const contextRoot = createTempDir('jiminy-context-')
  writeFixtureFiles(contextRoot)
  writeExtraContextFolderFixture(contextRoot)

  const store = createStore()
  const summarizer = {
    model: 'test-model',
    summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
    summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`
  }

  const result = await syncContextGraph({
    rootPath: contextRoot,
    store,
    summarizer
  })

  assert.equal(result.graph.counts.files, 2)
  assert.equal(result.graph.counts.folders, 2)

  const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'))
  const extraNode = Object.values(stored.nodes).find((node) => node.relativePath === path.join(`notes-${EXTRA_CONTEXT_SUFFIX}`, 'analysis.md'))
  assert.equal(extraNode, undefined)
})

test('sync ignores hidden folders like .git', async () => {
  const contextRoot = createTempDir('jiminy-context-')
  writeFixtureFiles(contextRoot)
  writeHiddenFolderFixture(contextRoot)

  const store = createStore()
  const summarizer = {
    model: 'test-model',
    summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
    summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`
  }

  const result = await syncContextGraph({
    rootPath: contextRoot,
    store,
    summarizer
  })

  assert.equal(result.graph.counts.files, 2)

  const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'))
  const hiddenNode = Object.values(stored.nodes).find((node) => node.relativePath === path.join('.git', 'config.md'))
  assert.equal(hiddenNode, undefined)
})

test('sync respects scoped .gitignore patterns', async () => {
  const contextRoot = createTempDir('jiminy-context-')
  writeScopedGitignoreFixture(contextRoot)

  const store = createStore()
  const summarizer = {
    model: 'test-model',
    summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
    summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`
  }

  await syncContextGraph({
    rootPath: contextRoot,
    store,
    summarizer
  })

  const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'))
  const paths = new Set(Object.values(stored.nodes).map((node) => node.relativePath))

  const expectedPresent = [
    toPosix(path.join('A', 'keep.md')),
    toPosix(path.join('A', 'sub', 'keep.md')),
    toPosix(path.join('A', 'sub', 'root-only', 'kept.txt')),
    toPosix(path.join('A', 'note.txt')),
    toPosix(path.join('B', 'abc', 'keep.md')),
    toPosix(path.join('B', 'ignore.md'))
  ]

  const expectedAbsent = [
    toPosix(path.join('A', 'abc', 'ignored.md')),
    toPosix(path.join('A', 'cache', 'ignored.txt')),
    toPosix(path.join('A', 'root-only', 'ignored.txt')),
    toPosix(path.join('A', 'ignore.md'))
  ]

  for (const pathValue of expectedPresent) {
    assert.ok(paths.has(pathValue), `Expected ${pathValue} to be included`)
  }

  for (const pathValue of expectedAbsent) {
    assert.equal(paths.has(pathValue), false, `Expected ${pathValue} to be excluded`)
  }
})
