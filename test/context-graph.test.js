const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JsonContextGraphStore, syncContextGraph } = require('../src/context-graph');
const { constructContextGraphSkeleton } = require('../src/context-graph/graphSkeleton');
const {
    CAPTURES_DIR_NAME,
    EXTRA_CONTEXT_SUFFIX,
    GENERAL_ANALYSIS_DIR_NAME,
    JIMINY_BEHIND_THE_SCENES_DIR_NAME,
    MAX_CONTEXT_FILE_SIZE_BYTES,
} = require('../src/const');

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const toPosix = (value) => value.split(path.sep).join('/');

const writeFixtureFiles = (rootPath) => {
    fs.mkdirSync(path.join(rootPath, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(rootPath, 'alpha.md'), 'Alpha file content', 'utf-8');
    fs.writeFileSync(path.join(rootPath, 'sub', 'beta.txt'), 'Beta file content', 'utf-8');
};

const writeCycleFixture = (rootPath) => {
    const subPath = path.join(rootPath, 'sub');
    fs.mkdirSync(subPath, { recursive: true });
    fs.writeFileSync(path.join(subPath, 'gamma.txt'), 'Gamma file content', 'utf-8');
    fs.symlinkSync(rootPath, path.join(subPath, 'loop'), 'dir');
};

const writeManyFilesFixture = (rootPath, count) => {
    for (let i = 0; i < count; i += 1) {
        fs.writeFileSync(path.join(rootPath, `file-${i}.txt`), `File ${i} content`, 'utf-8');
    }
};

const writeJsMdFixture = (rootPath) => {
    for (let i = 0; i < 7; i += 1) {
        fs.writeFileSync(path.join(rootPath, `script-${i}.js`), `console.log(${i})`, 'utf-8');
    }

    for (let i = 0; i < 2; i += 1) {
        fs.writeFileSync(path.join(rootPath, `note-${i}.md`), `Note ${i}`, 'utf-8');
    }
};

const writeSkipFixture = (rootPath) => {
    fs.mkdirSync(path.join(rootPath, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(rootPath, 'docs', 'keep.md'), '# Keep', 'utf-8');
    fs.writeFileSync(path.join(rootPath, 'notes.txt'), 'Keep this too', 'utf-8');
    fs.writeFileSync(path.join(rootPath, 'image.png'), 'not really png', 'utf-8');
};

const writeLargeFileFixture = (rootPath) => {
    fs.writeFileSync(path.join(rootPath, 'small.md'), 'Small file', 'utf-8');
    const largeBuffer = Buffer.alloc(MAX_CONTEXT_FILE_SIZE_BYTES + 1, 'a');
    fs.writeFileSync(path.join(rootPath, 'large.md'), largeBuffer);
};

const writeCaptureFolderFixture = (rootPath) => {
    const capturesPath = path.join(rootPath, CAPTURES_DIR_NAME);
    fs.mkdirSync(capturesPath, { recursive: true });
    fs.writeFileSync(path.join(capturesPath, 'capture.md'), 'Captured content', 'utf-8');
};

const writeBehindTheScenesFixture = (rootPath) => {
    const behindPath = path.join(rootPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME);
    fs.mkdirSync(behindPath, { recursive: true });
    fs.writeFileSync(path.join(behindPath, 'note.md'), 'Should be ignored', 'utf-8');
};

const writeExtraContextFolderFixture = (rootPath) => {
    const extraFolder = path.join(rootPath, `notes-${EXTRA_CONTEXT_SUFFIX}`);
    fs.mkdirSync(extraFolder, { recursive: true });
    fs.writeFileSync(path.join(extraFolder, 'analysis.md'), 'Generated analysis', 'utf-8');
};

const writeGeneralAnalysisFolderFixture = (rootPath) => {
    const generalFolder = path.join(rootPath, GENERAL_ANALYSIS_DIR_NAME);
    fs.mkdirSync(generalFolder, { recursive: true });
    fs.writeFileSync(path.join(generalFolder, 'analysis.md'), 'General analysis', 'utf-8');
};

const writeHiddenFolderFixture = (rootPath) => {
    const hiddenFolder = path.join(rootPath, '.git');
    fs.mkdirSync(hiddenFolder, { recursive: true });
    fs.writeFileSync(path.join(hiddenFolder, 'config.md'), 'Hidden config', 'utf-8');
};

const writeScopedGitignoreFixture = (rootPath) => {
    const folderA = path.join(rootPath, 'A');
    const folderB = path.join(rootPath, 'B');

    fs.mkdirSync(path.join(folderA, 'abc'), { recursive: true });
    fs.mkdirSync(path.join(folderA, 'cache'), { recursive: true });
    fs.mkdirSync(path.join(folderA, 'root-only'), { recursive: true });
    fs.mkdirSync(path.join(folderA, 'sub', 'root-only'), { recursive: true });
    fs.mkdirSync(path.join(folderB, 'abc'), { recursive: true });

    fs.writeFileSync(
        path.join(folderA, '.gitignore'),
        ['# ignore abc at folder A root', '/abc', 'cache/', '*.md', '!keep.md', '/root-only'].join('\n'),
        'utf-8'
    );

    fs.writeFileSync(path.join(folderA, 'abc', 'ignored.md'), 'Ignored by /abc', 'utf-8');
    fs.writeFileSync(path.join(folderA, 'cache', 'ignored.txt'), 'Ignored by cache/', 'utf-8');
    fs.writeFileSync(path.join(folderA, 'root-only', 'ignored.txt'), 'Ignored by /root-only', 'utf-8');
    fs.writeFileSync(path.join(folderA, 'sub', 'root-only', 'kept.txt'), 'Should be kept', 'utf-8');
    fs.writeFileSync(path.join(folderA, 'keep.md'), 'Should be kept', 'utf-8');
    fs.writeFileSync(path.join(folderA, 'ignore.md'), 'Ignored by *.md', 'utf-8');
    fs.writeFileSync(path.join(folderA, 'sub', 'keep.md'), 'Should be kept', 'utf-8');
    fs.writeFileSync(path.join(folderA, 'note.txt'), 'Should be kept', 'utf-8');

    fs.writeFileSync(path.join(folderB, 'abc', 'keep.md'), 'Should be kept', 'utf-8');
    fs.writeFileSync(path.join(folderB, 'ignore.md'), 'Should be kept', 'utf-8');
};
const createStore = (contextFolderPath) => new JsonContextGraphStore({ contextFolderPath });

test('context graph store delete removes the persisted file', () => {
    const contextRoot = createTempDir('jiminy-context-');
    const store = createStore(contextRoot);
    const graph = {
        version: 1,
        rootPath: contextRoot,
        generatedAt: new Date().toISOString(),
        model: 'test',
        rootId: 'root',
        counts: { files: 0, folders: 0 },
        nodes: {},
    };

    store.save(graph);
    assert.equal(fs.existsSync(store.getPath()), true);

    const result = store.delete();
    assert.equal(result.deleted, true);
    assert.equal(fs.existsSync(store.getPath()), false);

    const second = store.delete();
    assert.equal(second.deleted, false);
});

test('context graph store exposes load errors for diagnostics', () => {
    const contextRoot = createTempDir('jiminy-context-');
    const store = createStore(contextRoot);
    const graphPath = store.getPath();

    fs.mkdirSync(path.dirname(graphPath), { recursive: true });
    fs.writeFileSync(graphPath, '{invalid-json', 'utf-8');

    const loaded = store.load();
    assert.equal(loaded, null);
    const lastError = store.getLastError();
    assert.ok(lastError);
    assert.equal(typeof lastError.message, 'string');
    assert.ok(lastError.message.length > 0);
});

test('context graph store writes under jiminy', () => {
    const contextRoot = createTempDir('jiminy-context-');
    const store = createStore(contextRoot);
    const expectedPath = path.join(contextRoot, JIMINY_BEHIND_THE_SCENES_DIR_NAME, 'context-tree.json');

    const graph = {
        version: 1,
        rootPath: contextRoot,
        generatedAt: new Date().toISOString(),
        model: 'test',
        rootId: 'root',
        counts: { files: 0, folders: 0 },
        nodes: {},
    };

    store.save(graph);

    assert.equal(store.getPath(), expectedPath);
    assert.equal(fs.existsSync(expectedPath), true);
});

test('context graph totals match sync counts', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);
    writeCaptureFolderFixture(contextRoot);

    const ignoredPath = path.join(contextRoot, 'ignored');
    fs.mkdirSync(ignoredPath, { recursive: true });
    fs.writeFileSync(path.join(ignoredPath, 'skip.md'), 'Skip me', 'utf-8');

    const exclusions = ['ignored'];
    const skeleton = constructContextGraphSkeleton(contextRoot, { exclusions });

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
        exclusions,
    });

    assert.equal(result.graph.counts.files, skeleton.counts.files);
    assert.equal(result.graph.counts.folders, skeleton.counts.folders);
});

test('sync builds a context graph and persists json', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);

    const store = createStore(contextRoot);
    const calls = { files: 0, folders: 0 };
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => {
            calls.files += 1;
            return `Summary for ${relativePath}`;
        },
        summarizeFolder: async ({ relativePath }) => {
            calls.folders += 1;
            return `Folder summary for ${relativePath || '.'}`;
        },
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    assert.equal(result.graph.counts.files, 2);
    assert.equal(result.graph.counts.folders, 2);
    assert.ok(fs.existsSync(store.getPath()));
    assert.equal(calls.files, 2);
    assert.equal(calls.folders, 2);

    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const fileNode = Object.values(stored.nodes).find(
        (node) => node.type === 'file' && node.relativePath === 'alpha.md'
    );
    assert.ok(fileNode);
    assert.ok(fileNode.contentHash);
    assert.ok(fileNode.summary);
});

test('sync reuses file summaries when content hash is unchanged', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Initial summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    const noFileSummaries = {
        model: 'test-model',
        summarizeFile: async () => {
            throw new Error('summarizeFile should not be called for unchanged files');
        },
        summarizeFolder: async ({ relativePath }) => `Updated folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer: noFileSummaries,
    });

    assert.equal(result.graph.counts.files, 2);
    assert.equal(result.graph.counts.folders, 2);
});

test('sync warns on directory cycles and avoids recursion', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeCycleFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    assert.ok(Array.isArray(result.warnings));
    assert.ok(result.warnings.length > 0);
    assert.match(result.warnings[0].path, /loop/);
});

test('sync fails when MAX_NODES is exceeded', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeManyFilesFixture(contextRoot, 10);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    await assert.rejects(
        syncContextGraph({
            rootPath: contextRoot,
            store,
            summarizer,
            maxNodes: 5,
        }),
        /MAX_NODES/
    );
});

test('sync ignores unsupported files when MAX_NODES is low', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeJsMdFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
        maxNodes: 5,
    });

    assert.equal(result.graph.counts.files, 2);
    assert.equal(result.graph.counts.folders, 1);
});

test('sync skips non-md/txt files and logs a warning', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeSkipFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const logs = [];
    const logger = {
        log: (message, meta) => logs.push({ message, meta }),
        warn: () => {},
        error: () => {},
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
        logger,
    });

    assert.equal(result.graph.counts.files, 2);
    assert.ok(logs.some((entry) => entry.message === 'Skipping unsupported file'));

    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const skipped = Object.values(stored.nodes).find((node) => node.relativePath === 'image.png');
    assert.equal(skipped, undefined);
});

test('constructContextGraphSkeleton returns ignored paths separately', () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeSkipFixture(contextRoot);
    writeHiddenFolderFixture(contextRoot);

    const result = constructContextGraphSkeleton(contextRoot);

    assert.ok(Array.isArray(result.ignores));
    const ignoredPaths = result.ignores.map((entry) => entry.path);
    assert.ok(ignoredPaths.includes('image.png'));
    assert.ok(ignoredPaths.includes('.git'));

    const imageIgnore = result.ignores.find((entry) => entry.path === 'image.png');
    assert.equal(imageIgnore?.type, 'file');
});

test('sync returns ignored paths in results', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeSkipFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    assert.ok(Array.isArray(result.ignores));
    assert.ok(result.ignores.some((entry) => entry.path === 'image.png'));
    assert.equal(result.ignoredFiles, 1);
});

test('sync skips files larger than MAX_CONTEXT_FILE_SIZE_BYTES', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeLargeFileFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const logs = [];
    const logger = {
        log: (message, meta) => logs.push({ message, meta }),
        warn: () => {},
        error: () => {},
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
        logger,
    });

    assert.equal(result.graph.counts.files, 1);
    assert.ok(logs.some((entry) => entry.message === 'Skipping large file'));

    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const largeNode = Object.values(stored.nodes).find((node) => node.relativePath === 'large.md');
    assert.equal(largeNode, undefined);
});

test('sync ignores the captures folder', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);
    writeCaptureFolderFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    assert.equal(result.graph.counts.files, 2);
    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const capturedNode = Object.values(stored.nodes).find(
        (node) => node.relativePath === path.join(CAPTURES_DIR_NAME, 'capture.md')
    );
    assert.equal(capturedNode, undefined);
});

test('sync ignores jiminy behind-the-scenes folder', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);
    writeBehindTheScenesFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    assert.equal(result.graph.counts.files, 2);
    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const behindNode = Object.values(stored.nodes).find(
        (node) => node.relativePath === path.join(JIMINY_BEHIND_THE_SCENES_DIR_NAME, 'note.md')
    );
    assert.equal(behindNode, undefined);
});

test('sync ignores jiminy extra context folders', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);
    writeExtraContextFolderFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    assert.equal(result.graph.counts.files, 2);
    assert.equal(result.graph.counts.folders, 2);

    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const extraNode = Object.values(stored.nodes).find(
        (node) => node.relativePath === path.join(`notes-${EXTRA_CONTEXT_SUFFIX}`, 'analysis.md')
    );
    assert.equal(extraNode, undefined);
});

test('sync ignores jiminy general analysis folders', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);
    writeGeneralAnalysisFolderFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    assert.equal(result.graph.counts.files, 2);
    assert.equal(result.graph.counts.folders, 2);

    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const generalNode = Object.values(stored.nodes).find(
        (node) => node.relativePath === path.join(GENERAL_ANALYSIS_DIR_NAME, 'analysis.md')
    );
    assert.equal(generalNode, undefined);
});

test('sync ignores hidden folders like .git', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);
    writeHiddenFolderFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    assert.equal(result.graph.counts.files, 2);

    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const hiddenNode = Object.values(stored.nodes).find((node) => node.relativePath === path.join('.git', 'config.md'));
    assert.equal(hiddenNode, undefined);
});

test('sync respects scoped .gitignore patterns', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeScopedGitignoreFixture(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const paths = new Set(Object.values(stored.nodes).map((node) => node.relativePath));

    const expectedPresent = [
        toPosix(path.join('A', 'keep.md')),
        toPosix(path.join('A', 'sub', 'keep.md')),
        toPosix(path.join('A', 'sub', 'root-only', 'kept.txt')),
        toPosix(path.join('A', 'note.txt')),
        toPosix(path.join('B', 'abc', 'keep.md')),
        toPosix(path.join('B', 'ignore.md')),
    ];

    const expectedAbsent = [
        toPosix(path.join('A', 'abc', 'ignored.md')),
        toPosix(path.join('A', 'cache', 'ignored.txt')),
        toPosix(path.join('A', 'root-only', 'ignored.txt')),
        toPosix(path.join('A', 'ignore.md')),
    ];

    for (const pathValue of expectedPresent) {
        assert.ok(paths.has(pathValue), `Expected ${pathValue} to be included`);
    }

    for (const pathValue of expectedAbsent) {
        assert.equal(paths.has(pathValue), false, `Expected ${pathValue} to be excluded`);
    }
});

test('gitignore stat errors are logged for diagnostics', () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);
    fs.writeFileSync(path.join(contextRoot, '.gitignore'), 'ignored.txt', 'utf-8');

    const warnings = [];
    const logger = {
        log: () => {},
        warn: (...args) => warnings.push(args),
        error: () => {},
    };

    const originalStatSync = fs.statSync;
    fs.statSync = (targetPath) => {
        const normalized = targetPath.replace(/\\/g, '/');
        if (normalized.endsWith('/.gitignore')) {
            const error = new Error('permission denied');
            error.code = 'EACCES';
            throw error;
        }
        return originalStatSync(targetPath);
    };

    try {
        constructContextGraphSkeleton(contextRoot, { logger });
    } finally {
        fs.statSync = originalStatSync;
    }

    assert.ok(warnings.some((args) => args[0] === 'Failed to stat .gitignore'));
});

test('sync logs and removes deleted nodes from the stored graph', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    fs.unlinkSync(path.join(contextRoot, 'alpha.md'));

    const logs = [];
    const logger = {
        log: (message, meta) => logs.push({ message, meta }),
        warn: () => {},
        error: () => {},
    };

    await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
        logger,
    });

    assert.ok(logs.some((entry) => entry.message === 'Removed deleted context node'));
    assert.ok(
        logs.some((entry) => entry.message === 'Removed deleted context node' && entry.meta?.path === 'alpha.md')
    );

    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const removedNode = Object.values(stored.nodes).find((node) => node.relativePath === 'alpha.md');
    assert.equal(removedNode, undefined);
});

// ============================================================================
// JIM-31: Incremental sync and contentHash tests
// ============================================================================

test('every node has non-empty contentHash after sync', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));

    // Check all nodes have contentHash
    for (const [nodeId, node] of Object.entries(stored.nodes)) {
        assert.ok(node.contentHash, `Node ${nodeId} (${node.relativePath}) should have contentHash`);
        assert.equal(typeof node.contentHash, 'string', `contentHash should be a string`);
        assert.ok(node.contentHash.length > 0, `contentHash should not be empty`);
    }
});

test('folder nodes have contentHash computed from children', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    const stored = JSON.parse(fs.readFileSync(store.getPath(), 'utf-8'));
    const folderNodes = Object.values(stored.nodes).filter((node) => node.type === 'folder');

    assert.ok(folderNodes.length > 0, 'Should have folder nodes');
    for (const folder of folderNodes) {
        assert.ok(folder.contentHash, `Folder ${folder.relativePath} should have contentHash`);
    }
});

test('two syncs with no changes results in all synced and no LLM calls', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);

    const store = createStore(contextRoot);
    const firstCalls = { files: 0, folders: 0 };
    const firstSummarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => {
            firstCalls.files += 1;
            return `Summary for ${relativePath}`;
        },
        summarizeFolder: async ({ relativePath }) => {
            firstCalls.folders += 1;
            return `Folder summary for ${relativePath || '.'}`;
        },
    };

    // First sync
    const firstResult = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer: firstSummarizer,
    });

    assert.ok(firstCalls.files > 0, 'First sync should call summarizeFile');
    assert.ok(firstCalls.folders > 0, 'First sync should call summarizeFolder');

    // Second sync - should reuse cached summaries (no LLM calls)
    const secondCalls = { files: 0, folders: 0 };
    const secondSummarizer = {
        model: 'test-model',
        summarizeFile: async () => {
            secondCalls.files += 1;
            throw new Error('summarizeFile should not be called for unchanged files');
        },
        summarizeFolder: async () => {
            secondCalls.folders += 1;
            throw new Error('summarizeFolder should not be called for unchanged folders');
        },
    };

    const secondResult = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer: secondSummarizer,
    });

    // Verify no LLM calls on second sync
    assert.equal(secondCalls.files, 0, 'Second sync should not call summarizeFile');
    assert.equal(secondCalls.folders, 0, 'Second sync should not call summarizeFolder');

    // Verify syncStats: all should be synced, none out-of-sync or new
    const totalNodes = secondResult.graph.counts.files + secondResult.graph.counts.folders;
    assert.equal(secondResult.syncStats.synced, totalNodes, 'All nodes should be synced');
    assert.equal(secondResult.syncStats.outOfSync, 0, 'No nodes should be out-of-sync');
    assert.equal(secondResult.syncStats.new, 0, 'No nodes should be new');
});

test('editing a file makes it out-of-sync while siblings remain synced', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot); // Creates alpha.md and sub/beta.txt

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    // First sync
    await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    // Modify one file
    fs.writeFileSync(path.join(contextRoot, 'alpha.md'), 'Modified alpha content', 'utf-8');

    // Second sync - track which files get summarized
    const summarizedPaths = [];
    const trackingSummarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => {
            summarizedPaths.push(relativePath);
            return `New summary for ${relativePath}`;
        },
        summarizeFolder: async ({ relativePath }) => {
            summarizedPaths.push(relativePath || '(root)');
            return `New folder summary for ${relativePath || '.'}`;
        },
    };

    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer: trackingSummarizer,
    });

    // The modified file should be out-of-sync and re-summarized
    assert.ok(summarizedPaths.includes('alpha.md'), 'Modified file should be re-summarized');

    // The unchanged sibling file should NOT be re-summarized
    assert.equal(summarizedPaths.includes('sub/beta.txt'), false, 'Unchanged sibling file should NOT be re-summarized');

    // syncStats should reflect: 1 out-of-sync file, unchanged file synced
    assert.ok(result.syncStats.outOfSync > 0, 'Should have out-of-sync nodes');
    assert.ok(result.syncStats.synced > 0, 'Should have synced nodes (unchanged sibling)');
});

test('editing a file makes ancestor folders out-of-sync', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot); // Creates alpha.md and sub/beta.txt

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    // First sync
    await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    // Modify the file in the subfolder
    fs.writeFileSync(path.join(contextRoot, 'sub', 'beta.txt'), 'Modified beta content', 'utf-8');

    // Second sync - track which folders get summarized
    const summarizedFolders = [];
    const trackingSummarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `New summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => {
            summarizedFolders.push(relativePath || '(root)');
            return `New folder summary for ${relativePath || '.'}`;
        },
    };

    await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer: trackingSummarizer,
    });

    // The 'sub' folder should be out-of-sync (child changed)
    assert.ok(summarizedFolders.includes('sub'), 'Child folder should be re-summarized');

    // The root folder should also be out-of-sync (descendant changed)
    assert.ok(summarizedFolders.includes('(root)'), 'Root folder should be re-summarized');
});

test('syncStats correctly tracks new nodes on first sync', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    // First sync - no previous graph exists, all nodes are new
    const result = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    const totalNodes = result.graph.counts.files + result.graph.counts.folders;
    assert.equal(result.syncStats.new, totalNodes, 'All nodes should be new on first sync');
    assert.equal(result.syncStats.synced, 0, 'No nodes should be synced on first sync');
    assert.equal(result.syncStats.outOfSync, 0, 'No nodes should be out-of-sync on first sync');
});

test('adding a new file creates a new node in syncStats', async () => {
    const contextRoot = createTempDir('jiminy-context-');
    writeFixtureFiles(contextRoot);

    const store = createStore(contextRoot);
    const summarizer = {
        model: 'test-model',
        summarizeFile: async ({ relativePath }) => `Summary for ${relativePath}`,
        summarizeFolder: async ({ relativePath }) => `Folder summary for ${relativePath || '.'}`,
    };

    // First sync
    const firstResult = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    // Add a new file
    fs.writeFileSync(path.join(contextRoot, 'gamma.md'), 'Gamma content', 'utf-8');

    // Second sync
    const secondResult = await syncContextGraph({
        rootPath: contextRoot,
        store,
        summarizer,
    });

    // Should have 1 new node (the new file)
    // Plus folders might be out-of-sync due to the new child
    assert.ok(secondResult.syncStats.new >= 1, 'Should have at least 1 new node');
});
