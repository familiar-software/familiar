const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

const makeFakeImage = () => {
    const cropped = {
        toPNG: () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    };

    return {
        isEmpty: () => false,
        getSize: () => ({ width: 100, height: 100 }),
        crop: () => cropped,
    };
};

const resetRequireCache = () => {
    const capturePath = require.resolve('../src/screenshot/capture');
    const extractionPath = require.resolve('../src/extraction');
    delete require.cache[capturePath];
    delete require.cache[extractionPath];
};

const stubElectron = ({ handlers, toastCalls } = {}) => {
    class FakeWindow {
        constructor() {
            this._listeners = new Map();
            this._destroyed = false;
        }

        setVisibleOnAllWorkspaces() {}
        setAlwaysOnTop() {}
        loadFile() {}
        show() {}
        showInactive() {}
        hide() {}
        focus() {}
        close() {
            this._destroyed = true;
        }
        destroy() {
            this._destroyed = true;
        }
        isDestroyed() {
            return this._destroyed;
        }

        once(event, listener) {
            this._listeners.set(event, listener);
            // Fire ready-to-show immediately for toast
            if (event === 'ready-to-show') {
                setTimeout(() => listener(), 0);
            }
        }

        on(event, listener) {
            this._listeners.set(event, listener);
        }

        get webContents() {
            return { send: () => {} };
        }
    }

    const stub = {
        app: {
            getAppPath: () => '/tmp',
            getName: () => 'Jiminy',
            isPackaged: false,
        },
        BrowserWindow: FakeWindow,
        desktopCapturer: {
            getSources: async () => [
                {
                    id: 'screen:1',
                    name: 'Screen 1',
                    display_id: 1,
                    thumbnail: makeFakeImage(),
                },
            ],
        },
        ipcMain: {
            handle: (channel, handler) => {
                handlers[channel] = handler;
            },
        },
        screen: {
            getCursorScreenPoint: () => ({ x: 0, y: 0 }),
            getDisplayNearestPoint: () => ({
                id: 1,
                bounds: { x: 0, y: 0, width: 100, height: 100 },
                scaleFactor: 1,
            }),
            getPrimaryDisplay: () => ({
                workAreaSize: { width: 1920, height: 1080 },
                workArea: { x: 0, y: 0, width: 1920, height: 1080 },
            }),
        },
        dialog: {
            showMessageBox: async () => ({}),
        },
        systemPreferences: {
            getMediaAccessStatus: () => 'granted',
        },
    };

    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'electron') {
            return stub;
        }
        if (request === '../toast') {
            return {
                showToast: (payload) => {
                    if (toastCalls) {
                        toastCalls.push(payload);
                    }
                },
            };
        }
        if (request === '../history' || request === '../../history') {
            return { recordEvent: () => {} };
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    return () => {
        Module._load = originalLoad;
    };
};

test('capture enqueues image extraction event after save', async () => {
    const handlers = {};
    const restoreElectron = stubElectron({ handlers });
    resetRequireCache();
    const extraction = require('../src/extraction');
    const originalEnqueue = extraction.extractionQueue.enqueue;

    let enqueuedEvent = null;
    extraction.extractionQueue.enqueue = async (event) => {
        enqueuedEvent = event;
        return { ok: true };
    };

    const tempSettingsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-settings-'));
    const tempContextDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-context-'));
    const settingsPath = path.join(tempSettingsDir, 'settings.json');

    const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR;
    const previousMock = process.env.JIMINY_LLM_MOCK;
    const previousMockText = process.env.JIMINY_LLM_MOCK_TEXT;
    process.env.JIMINY_SETTINGS_DIR = tempSettingsDir;

    let analysisQueue = null;
    try {
        await fs.writeFile(
            settingsPath,
            JSON.stringify(
                {
                    contextFolderPath: tempContextDir,
                    llm_provider: { provider: 'gemini', api_key: '' },
                },
                null,
                2
            ),
            'utf-8'
        );

        const capture = require('../src/screenshot/capture');
        capture.registerCaptureHandlers();

        await capture.startCaptureFlow();

        const grabHandler = handlers['capture:grab'];
        assert.equal(typeof grabHandler, 'function');

        const result = await grabHandler(null, {
            rectCss: { x: 0, y: 0, width: 50, height: 50 },
            viewport: { width: 100, height: 100 },
            screenOffset: { x: 0, y: 0 },
        });

        assert.equal(result.ok, true);
        assert.ok(result.savedPath);
        assert.equal(enqueuedEvent.sourceType, 'image');
        assert.deepEqual(enqueuedEvent.metadata, { path: result.savedPath });
        assert.equal(typeof enqueuedEvent.flow_id, 'string');
        assert.ok(enqueuedEvent.flow_id.length > 0);

        process.env.JIMINY_LLM_MOCK = '1';
        process.env.JIMINY_LLM_MOCK_TEXT = 'mock extraction';

        ({ analysisQueue } = require('../src/analysis'));
        const { handleImageExtractionEvent } = require('../src/extraction/image/handler');

        let analysisEvent = null;
        const analysisPromise = new Promise((resolve) => {
            analysisQueue.on((event) => {
                analysisEvent = event;
                resolve();
                return { ok: true };
            });
        });

        await handleImageExtractionEvent(enqueuedEvent);
        await analysisPromise;

        assert.equal(analysisEvent.flow_id, enqueuedEvent.flow_id);

    } finally {
        if (analysisQueue) {
            analysisQueue.clearHandlers();
        }
        extraction.extractionQueue.enqueue = originalEnqueue;
        restoreElectron();
        resetRequireCache();
        if (typeof previousSettingsDir === 'undefined') {
            delete process.env.JIMINY_SETTINGS_DIR;
        } else {
            process.env.JIMINY_SETTINGS_DIR = previousSettingsDir;
        }
        if (typeof previousMock === 'undefined') {
            delete process.env.JIMINY_LLM_MOCK;
        } else {
            process.env.JIMINY_LLM_MOCK = previousMock;
        }
        if (typeof previousMockText === 'undefined') {
            delete process.env.JIMINY_LLM_MOCK_TEXT;
        } else {
            process.env.JIMINY_LLM_MOCK_TEXT = previousMockText;
        }
    }
});

test('capture surfaces extraction enqueue failures', async () => {
    const handlers = {};
    const toastCalls = [];
    const restoreElectron = stubElectron({ handlers, toastCalls });
    resetRequireCache();
    const extraction = require('../src/extraction');
    const originalEnqueue = extraction.extractionQueue.enqueue;

    extraction.extractionQueue.enqueue = async () => {
        throw new Error('enqueue failed');
    };

    const tempSettingsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-settings-'));
    const tempContextDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-context-'));
    const settingsPath = path.join(tempSettingsDir, 'settings.json');

    const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR;
    process.env.JIMINY_SETTINGS_DIR = tempSettingsDir;

    try {
        await fs.writeFile(settingsPath, JSON.stringify({ contextFolderPath: tempContextDir }, null, 2), 'utf-8');

        const capture = require('../src/screenshot/capture');
        capture.registerCaptureHandlers();

        await capture.startCaptureFlow();

        const grabHandler = handlers['capture:grab'];
        assert.equal(typeof grabHandler, 'function');

        const result = await grabHandler(null, {
            rectCss: { x: 0, y: 0, width: 50, height: 50 },
            viewport: { width: 100, height: 100 },
            screenOffset: { x: 0, y: 0 },
        });

        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(result.ok, true);
        assert.equal(toastCalls.length, 2);
        assert.equal(toastCalls[0].type, 'success');
        assert.equal(toastCalls[0].title, 'Screenshot Captured');
        assert.equal(toastCalls[1].type, 'warning');
        assert.equal(toastCalls[1].title, 'Screenshot Captured (Not Queued)');
    } finally {
        extraction.extractionQueue.enqueue = originalEnqueue;
        restoreElectron();
        resetRequireCache();
        if (typeof previousSettingsDir === 'undefined') {
            delete process.env.JIMINY_SETTINGS_DIR;
        } else {
            process.env.JIMINY_SETTINGS_DIR = previousSettingsDir;
        }
    }
});
