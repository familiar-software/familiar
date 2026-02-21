const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const resetModule = (modulePath) => {
  const resolved = require.resolve(modulePath)
  delete require.cache[resolved]
}

function withStorageModule(run) {
  const handlers = {}
  const stubElectron = {
    BrowserWindow: {
      fromWebContents: () => null
    },
    dialog: {
      showMessageBox: async () => ({ response: 1 })
    },
    ipcMain: {
      handle: (channel, handler) => {
        handlers[channel] = handler
      }
    },
    shell: {}
  }

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  resetModule('../src/ipc/storage')
  const storageModule = require('../src/ipc/storage')

  return Promise.resolve()
    .then(() => run({ storageModule, handlers }))
    .finally(() => {
      Module._load = originalLoad
      resetModule('../src/ipc/storage')
    })
}

test('parseLeadingTimestampMs parses Familiar timestamp prefix with suffix', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const parsed = storageModule.parseLeadingTimestampMs('2026-02-17T12-30-45-123Z.clipboard.txt')
    assert.equal(parsed, Date.parse('2026-02-17T12:30:45.123Z'))
  })
})

test('collectFilesWithinWindow aborts when root is outside familiar folder', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-collect-'))
    const contextFolderPath = path.join(root, 'context')
    const familiarRoot = path.join(contextFolderPath, 'familiar')
    const outsideRoot = path.join(root, 'outside')
    fs.mkdirSync(familiarRoot, { recursive: true })
    fs.mkdirSync(outsideRoot, { recursive: true })

    const outsideFile = path.join(outsideRoot, '2026-02-17T12-20-00-000Z.md')
    fs.writeFileSync(outsideFile, 'outside', 'utf-8')

    const collected = storageModule.collectFilesWithinWindow(outsideRoot, {
      startMs: Date.parse('2026-02-17T12:00:00.000Z'),
      endMs: Date.parse('2026-02-17T12:30:00.000Z'),
      allowedRoots: [familiarRoot]
    })

    assert.deepEqual(collected, [])
    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('handleDeleteFiles does not delete files when familiar storage root is a symlink', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-symlink-root-'))
    const contextFolderPath = path.join(root, 'context')
    const familiarRoot = path.join(contextFolderPath, 'familiar')
    const outsideRoot = path.join(root, 'outside-storage')
    const outsideStillsRoot = path.join(outsideRoot, 'stills')
    const outsideStillsSessionDir = path.join(
      outsideStillsRoot,
      'session-2026-02-17T12-00-00-000Z'
    )
    const stillsRootSymlink = path.join(familiarRoot, 'stills')
    const markdownRoot = path.join(familiarRoot, 'stills-markdown')

    fs.mkdirSync(familiarRoot, { recursive: true })
    fs.mkdirSync(outsideStillsSessionDir, { recursive: true })
    fs.mkdirSync(markdownRoot, { recursive: true })
    fs.symlinkSync(outsideStillsRoot, stillsRootSymlink)

    const outsideStillFile = path.join(outsideStillsSessionDir, '2026-02-17T12-20-00-000Z.webp')
    fs.writeFileSync(outsideStillFile, 'outside', 'utf-8')

    let deleteCalls = 0
    const result = await storageModule.handleDeleteFiles(
      {},
      {
        requestedAtMs: Date.parse('2026-02-17T12:30:00.000Z'),
        deleteWindow: '15m'
      },
      {
        showMessageBox: async () => ({ response: 1 }),
        settingsLoader: () => ({ contextFolderPath }),
        deleteFile: async () => {
          deleteCalls += 1
        }
      }
    )

    assert.equal(result.ok, true)
    assert.equal(deleteCalls, 0)
    assert.equal(fs.existsSync(outsideStillFile), true)

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('resolveDeleteWindow falls back to 15m for unsupported values', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const resolved = storageModule.resolveDeleteWindow('unknown-window')
    assert.equal(resolved.key, '15m')
    assert.equal(resolved.label, '15 minutes')
    assert.equal(resolved.durationMs, 15 * 60 * 1000)
  })
})

test('handleDeleteFiles deletes matching files inside the selected window', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-ipc-'))
    const contextFolderPath = path.join(root, 'context')
    const stillsSessionDir = path.join(
      contextFolderPath,
      'familiar',
      'stills',
      'session-2026-02-17T12-00-00-000Z'
    )
    const markdownSessionDir = path.join(
      contextFolderPath,
      'familiar',
      'stills-markdown',
      'session-2026-02-17T12-00-00-000Z'
    )
    fs.mkdirSync(stillsSessionDir, { recursive: true })
    fs.mkdirSync(markdownSessionDir, { recursive: true })

    const insideWindowStill = path.join(stillsSessionDir, '2026-02-17T12-20-00-000Z.webp')
    const outsideWindowStill = path.join(stillsSessionDir, '2026-02-17T11-20-00-000Z.webp')
    const insideWindowMarkdown = path.join(markdownSessionDir, '2026-02-17T12-20-00-000Z.md')
    const insideWindowClipboard = path.join(
      markdownSessionDir,
      '2026-02-17T12-21-00-000Z.clipboard.txt'
    )

    fs.writeFileSync(insideWindowStill, 'inside', 'utf-8')
    fs.writeFileSync(outsideWindowStill, 'outside', 'utf-8')
    fs.writeFileSync(insideWindowMarkdown, 'md', 'utf-8')
    fs.writeFileSync(insideWindowClipboard, 'clip', 'utf-8')
    const deleted = []
    const result = await storageModule.handleDeleteFiles(
      {},
      {
        requestedAtMs: Date.parse('2026-02-17T12:30:00.000Z'),
        deleteWindow: '15m'
      },
      {
        showMessageBox: async () => ({ response: 1 }),
        deleteFile: async (filePath) => {
          deleted.push(filePath)
          fs.unlinkSync(filePath)
        },
        settingsLoader: () => ({ contextFolderPath })
      }
    )

    assert.equal(result.ok, true)
    assert.equal(result.message, 'Deleted files from last 15 minutes')
    assert.equal(fs.existsSync(insideWindowStill), false)
    assert.equal(fs.existsSync(insideWindowMarkdown), false)
    assert.equal(fs.existsSync(insideWindowClipboard), false)
    assert.equal(fs.existsSync(outsideWindowStill), true)
    assert.equal(deleted.length, 3)

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('handleDeleteFiles reports a failed delete with example path', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-ipc-fail-'))
    const contextFolderPath = path.join(root, 'context')
    const stillsSessionDir = path.join(
      contextFolderPath,
      'familiar',
      'stills',
      'session-2026-02-17T12-00-00-000Z'
    )
    fs.mkdirSync(stillsSessionDir, { recursive: true })

    const failingFile = path.join(stillsSessionDir, '2026-02-17T12-20-00-000Z.webp')
    fs.writeFileSync(failingFile, 'inside', 'utf-8')

    const result = await storageModule.handleDeleteFiles(
      {},
      {
        requestedAtMs: Date.parse('2026-02-17T12:30:00.000Z'),
        deleteWindow: '15m'
      },
      {
        showMessageBox: async () => ({ response: 1 }),
        deleteFile: async () => {
          throw new Error('delete failed')
        },
        settingsLoader: () => ({ contextFolderPath })
      }
    )

    assert.equal(result.ok, false)
    assert.match(result.message, /Could not delete all files\./)
    assert.match(result.message, new RegExp(failingFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('handleDeleteFiles supports all-time deletion window', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-ipc-all-'))
    const contextFolderPath = path.join(root, 'context')
    const stillsSessionDir = path.join(
      contextFolderPath,
      'familiar',
      'stills',
      'session-2026-02-17T12-00-00-000Z'
    )
    fs.mkdirSync(stillsSessionDir, { recursive: true })

    const oldStill = path.join(stillsSessionDir, '2026-02-16T08-20-00-000Z.webp')
    const recentStill = path.join(stillsSessionDir, '2026-02-17T12-20-00-000Z.webp')
    fs.writeFileSync(oldStill, 'old', 'utf-8')
    fs.writeFileSync(recentStill, 'recent', 'utf-8')

    const result = await storageModule.handleDeleteFiles(
      {},
      {
        requestedAtMs: Date.parse('2026-02-17T12:30:00.000Z'),
        deleteWindow: 'all'
      },
      {
        showMessageBox: async () => ({ response: 1 }),
        settingsLoader: () => ({ contextFolderPath })
      }
    )

    assert.equal(result.ok, true)
    assert.equal(result.message, 'Deleted files from last all time')
    assert.equal(fs.existsSync(oldStill), false)
    assert.equal(fs.existsSync(recentStill), false)

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('deleteFileIfAllowed aborts file outside familiar folder', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-guard-'))
    const familiarRoot = path.join(root, 'context', 'familiar')
    const outsideRoot = path.join(root, 'outside')
    fs.mkdirSync(familiarRoot, { recursive: true })
    fs.mkdirSync(outsideRoot, { recursive: true })

    const outsideFile = path.join(outsideRoot, '2026-02-17T12-20-00-000Z.md')
    fs.writeFileSync(outsideFile, 'outside', 'utf-8')

    let deleteCalls = 0
    const result = await storageModule.deleteFileIfAllowed(outsideFile, {
      allowedRoots: [familiarRoot],
      deleteFile: async () => {
        deleteCalls += 1
      }
    })

    assert.equal(result.ok, false)
    assert.equal(deleteCalls, 0)
    assert.match(result.message, /outside Familiar storage roots/i)

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('handleDeleteFiles calls collectFilesWithinWindow with stills roots', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-collect-roots-'))
    const contextFolderPath = path.join(root, 'context')
    fs.mkdirSync(path.join(contextFolderPath, 'familiar', 'stills'), { recursive: true })
    fs.mkdirSync(path.join(contextFolderPath, 'familiar', 'stills-markdown'), { recursive: true })

    const calls = []
    const collectSpy = (scanRoot, scanOptions = {}) => {
      calls.push({ scanRoot, scanOptions })
      return []
    }

    const requestedAtMs = Date.parse('2026-02-17T12:30:00.000Z')
    const result = await storageModule.handleDeleteFiles(
      {},
      { requestedAtMs, deleteWindow: '15m' },
      {
        showMessageBox: async () => ({ response: 1 }),
        settingsLoader: () => ({ contextFolderPath }),
        collectFilesWithinWindow: collectSpy
      }
    )

    const stillsRoot = path.join(contextFolderPath, 'familiar', 'stills')
    const stillsMarkdownRoot = path.join(contextFolderPath, 'familiar', 'stills-markdown')

    assert.equal(result.ok, true)
    assert.equal(calls.length, 2)
    assert.equal(calls[0].scanRoot, stillsRoot)
    assert.equal(calls[1].scanRoot, stillsMarkdownRoot)
    assert.deepEqual(calls[0].scanOptions.allowedRoots, [stillsRoot, stillsMarkdownRoot])
    assert.deepEqual(calls[1].scanOptions.allowedRoots, [stillsRoot, stillsMarkdownRoot])

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('handleDeleteFiles passes allowedRoots to deleteFileIfAllowed', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-delete-roots-'))
    const contextFolderPath = path.join(root, 'context')
    const stillsRoot = path.join(contextFolderPath, 'familiar', 'stills')
    const stillsMarkdownRoot = path.join(contextFolderPath, 'familiar', 'stills-markdown')
    const sessionStillsDir = path.join(stillsRoot, 'session-2026-02-17T12-00-00-000Z')
    const sessionMarkdownDir = path.join(stillsMarkdownRoot, 'session-2026-02-17T12-00-00-000Z')
    fs.mkdirSync(sessionStillsDir, { recursive: true })
    fs.mkdirSync(sessionMarkdownDir, { recursive: true })

    const stillFile = path.join(sessionStillsDir, '2026-02-17T12-20-00-000Z.webp')
    const markdownFile = path.join(sessionMarkdownDir, '2026-02-17T12-21-00-000Z.md')
    fs.writeFileSync(stillFile, 'still', 'utf-8')
    fs.writeFileSync(markdownFile, 'markdown', 'utf-8')

    const deleteCalls = []
    const result = await storageModule.handleDeleteFiles(
      {},
      {
        requestedAtMs: Date.parse('2026-02-17T12:30:00.000Z'),
        deleteWindow: '15m'
      },
      {
        showMessageBox: async () => ({ response: 1 }),
        settingsLoader: () => ({ contextFolderPath }),
        deleteFileIfAllowed: async (filePath, options = {}) => {
          deleteCalls.push({ filePath, allowedRoots: options.allowedRoots || [] })
          return { ok: true, path: filePath }
        }
      }
    )

    assert.equal(result.ok, true)
    assert.equal(deleteCalls.length, 2)
    assert.deepEqual(deleteCalls[0].allowedRoots, [stillsRoot, stillsMarkdownRoot])
    assert.deepEqual(deleteCalls[1].allowedRoots, [stillsRoot, stillsMarkdownRoot])

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('handleDeleteFiles passes allowedRoots to deleteEmptySessionDirectories', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-empty-session-roots-'))
    const contextFolderPath = path.join(root, 'context')
    const stillsRoot = path.join(contextFolderPath, 'familiar', 'stills')
    const stillsMarkdownRoot = path.join(contextFolderPath, 'familiar', 'stills-markdown')
    fs.mkdirSync(stillsRoot, { recursive: true })
    fs.mkdirSync(stillsMarkdownRoot, { recursive: true })

    const deleteEmptyCalls = []
    const result = await storageModule.handleDeleteFiles(
      {},
      {
        requestedAtMs: Date.parse('2026-02-17T12:30:00.000Z'),
        deleteWindow: '15m'
      },
      {
        showMessageBox: async () => ({ response: 1 }),
        settingsLoader: () => ({ contextFolderPath }),
        deleteEmptySessionDirectories: async (_sessionRoots, options = {}) => {
          deleteEmptyCalls.push({ allowedRoots: options.allowedRoots || [] })
          return { deletedSessionDirs: [], failedSessionDirs: [] }
        }
      }
    )

    assert.equal(result.ok, true)
    assert.equal(deleteEmptyCalls.length, 1)
    assert.deepEqual(deleteEmptyCalls[0].allowedRoots, [stillsRoot, stillsMarkdownRoot])

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('parseSessionTimestampMs parses session folder name', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const parsed = storageModule.parseSessionTimestampMs('session-2026-02-17T12-30-45-123Z')
    assert.equal(parsed, Date.parse('2026-02-17T12:30:45.123Z'))
  })
})

test('resolveNewestSessionId resolves newest session across roots', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-newest-session-'))
    const stillsRoot = path.join(root, 'context', 'familiar', 'stills')
    const markdownRoot = path.join(root, 'context', 'familiar', 'stills-markdown')
    fs.mkdirSync(path.join(stillsRoot, 'session-2026-02-17T12-00-00-000Z'), { recursive: true })
    fs.mkdirSync(path.join(markdownRoot, 'session-2026-02-17T12-10-00-000Z'), { recursive: true })

    const newest = storageModule.resolveNewestSessionId([stillsRoot, markdownRoot], {
      allowedRoots: [stillsRoot, markdownRoot]
    })

    assert.equal(newest, 'session-2026-02-17T12-10-00-000Z')
    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('deleteEmptySessionDirectories removes empty old sessions but keeps newest and non-empty', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-session-delete-'))
    const stillsRoot = path.join(root, 'context', 'familiar', 'stills')
    const markdownRoot = path.join(root, 'context', 'familiar', 'stills-markdown')
    const oldEmptySession = path.join(stillsRoot, 'session-2026-02-17T11-00-00-000Z')
    const newestEmptySession = path.join(markdownRoot, 'session-2026-02-17T12-00-00-000Z')
    const nonEmptySession = path.join(stillsRoot, 'session-2026-02-17T10-00-00-000Z')

    fs.mkdirSync(oldEmptySession, { recursive: true })
    fs.mkdirSync(newestEmptySession, { recursive: true })
    fs.mkdirSync(nonEmptySession, { recursive: true })
    fs.writeFileSync(path.join(nonEmptySession, '2026-02-17T10-00-01-000Z.webp'), 'x', 'utf-8')

    const result = await storageModule.deleteEmptySessionDirectories([stillsRoot, markdownRoot], {
      allowedRoots: [stillsRoot, markdownRoot],
      skipSessionId: 'session-2026-02-17T12-00-00-000Z',
      deleteDirectory: async (dirPath) => {
        fs.rmdirSync(dirPath)
      }
    })

    assert.equal(fs.existsSync(oldEmptySession), false)
    assert.equal(fs.existsSync(newestEmptySession), true)
    assert.equal(fs.existsSync(nonEmptySession), true)
    assert.equal(result.deletedSessionDirs.length, 1)
    assert.equal(result.failedSessionDirs.length, 0)

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('deleteDirectoryIfAllowed aborts directory outside familiar folder', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-dir-guard-'))
    const familiarRoot = path.join(root, 'context', 'familiar')
    const outsideRoot = path.join(root, 'outside')
    fs.mkdirSync(familiarRoot, { recursive: true })
    fs.mkdirSync(outsideRoot, { recursive: true })

    let deleteCalls = 0
    const result = await storageModule.deleteDirectoryIfAllowed(outsideRoot, {
      allowedRoots: [familiarRoot],
      deleteDirectory: async () => {
        deleteCalls += 1
      }
    })

    assert.equal(result.ok, false)
    assert.equal(deleteCalls, 0)
    assert.match(result.message, /outside Familiar storage roots/i)

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('deleteEmptySessionDirectories ignores roots outside allowed roots', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-session-roots-'))
    const allowedRoot = path.join(root, 'context', 'familiar', 'stills')
    const outsideRoot = path.join(root, 'outside', 'stills')
    const outsideSession = path.join(outsideRoot, 'session-2026-02-17T12-00-00-000Z')
    fs.mkdirSync(allowedRoot, { recursive: true })
    fs.mkdirSync(outsideSession, { recursive: true })

    const deletedPaths = []
    await storageModule.deleteEmptySessionDirectories([outsideRoot], {
      allowedRoots: [allowedRoot],
      deleteDirectory: async (dirPath) => {
        deletedPaths.push(dirPath)
      }
    })

    assert.equal(deletedPaths.length, 0)
    assert.equal(fs.existsSync(outsideSession), true)

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('deleteEmptySessionDirectories passes allowedRoots to deleteDirectoryIfAllowed', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-dir-allowed-roots-'))
    const stillsRoot = path.join(root, 'context', 'familiar', 'stills')
    const sessionDir = path.join(stillsRoot, 'session-2026-02-17T11-00-00-000Z')
    fs.mkdirSync(sessionDir, { recursive: true })

    const calls = []
    const realStillsRoot = fs.realpathSync(stillsRoot)
    const result = await storageModule.deleteEmptySessionDirectories([stillsRoot], {
      allowedRoots: [stillsRoot],
      deleteDirectoryIfAllowedFn: async (dirPath, options = {}) => {
        calls.push({ dirPath, allowedRoots: options.allowedRoots || [] })
        return { ok: true, path: dirPath }
      }
    })

    assert.ok(result)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].allowedRoots, [realStillsRoot])

    fs.rmSync(root, { recursive: true, force: true })
  })
})

test('handleDeleteFiles removes emptied old session directories with default directory delete implementation', async () => {
  await withStorageModule(async ({ storageModule }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-ipc-empty-session-'))
    const contextFolderPath = path.join(root, 'context')
    const oldStillsSessionDir = path.join(
      contextFolderPath,
      'familiar',
      'stills',
      'session-2026-02-17T11-00-00-000Z'
    )
    const newestStillsSessionDir = path.join(
      contextFolderPath,
      'familiar',
      'stills',
      'session-2026-02-17T12-00-00-000Z'
    )
    const oldMarkdownSessionDir = path.join(
      contextFolderPath,
      'familiar',
      'stills-markdown',
      'session-2026-02-17T11-00-00-000Z'
    )
    const newestMarkdownSessionDir = path.join(
      contextFolderPath,
      'familiar',
      'stills-markdown',
      'session-2026-02-17T12-00-00-000Z'
    )
    fs.mkdirSync(oldStillsSessionDir, { recursive: true })
    fs.mkdirSync(newestStillsSessionDir, { recursive: true })
    fs.mkdirSync(oldMarkdownSessionDir, { recursive: true })
    fs.mkdirSync(newestMarkdownSessionDir, { recursive: true })

    fs.writeFileSync(path.join(oldStillsSessionDir, '2026-02-17T12-20-00-000Z.webp'), 'recent', 'utf-8')
    fs.writeFileSync(path.join(oldMarkdownSessionDir, '2026-02-17T12-20-00-000Z.md'), 'recent-md', 'utf-8')
    fs.writeFileSync(
      path.join(oldMarkdownSessionDir, '2026-02-17T12-21-00-000Z.clipboard.txt'),
      'recent-clip',
      'utf-8'
    )
    fs.writeFileSync(path.join(newestStillsSessionDir, '2026-02-17T12-00-00-000Z.webp'), 'keep', 'utf-8')
    fs.writeFileSync(path.join(newestMarkdownSessionDir, '2026-02-17T12-00-00-000Z.md'), 'keep-md', 'utf-8')

    const result = await storageModule.handleDeleteFiles(
      {},
      {
        requestedAtMs: Date.parse('2026-02-17T12:30:00.000Z'),
        deleteWindow: '15m'
      },
      {
        showMessageBox: async () => ({ response: 1 }),
        settingsLoader: () => ({ contextFolderPath })
      }
    )

    assert.equal(result.ok, true)
    assert.equal(fs.existsSync(oldStillsSessionDir), false)
    assert.equal(fs.existsSync(oldMarkdownSessionDir), false)
    assert.equal(fs.existsSync(newestStillsSessionDir), true)
    assert.equal(fs.existsSync(newestMarkdownSessionDir), true)

    fs.rmSync(root, { recursive: true, force: true })
  })
})
