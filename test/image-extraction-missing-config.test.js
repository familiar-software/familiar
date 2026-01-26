const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const makeTempSettingsDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'jiminy-settings-'));

const resetModule = (modulePath) => {
    delete require.cache[modulePath];
};

const mockModule = (modulePath, exports) => {
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports,
    };
};

const writeSettings = async (settingsDir, payload) =>
    fs.writeFile(path.join(settingsDir, 'settings.json'), JSON.stringify(payload, null, 2), 'utf-8');

test('image extraction notifies when LLM provider is missing', async () => {
    const flowId = 'flow-missing-provider';
    const settingsDir = await makeTempSettingsDir();
    await writeSettings(settingsDir, { llm_provider: { provider: '', api_key: 'test-key' } });

    const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR;
    const previousMock = process.env.JIMINY_LLM_MOCK;
    process.env.JIMINY_SETTINGS_DIR = settingsDir;
    delete process.env.JIMINY_LLM_MOCK;

    const toastPath = require.resolve('../src/toast');
    const handlerPath = require.resolve('../src/extraction/image/handler');
    const originalToastModule = require.cache[toastPath];

    const toastCalls = [];
    mockModule(toastPath, {
        showToast: (payload) => toastCalls.push(payload),
    });

    resetModule(handlerPath);

    try {
        const { handleImageExtractionEvent } = require('../src/extraction/image/handler');
        const result = await handleImageExtractionEvent({ metadata: { path: '/tmp/fake.png' }, flow_id: flowId });

        assert.deepEqual(result, { skipped: true, reason: 'missing_provider' });
        assert.equal(toastCalls.length, 1);
        assert.equal(toastCalls[0].title, 'LLM provider required');
    } finally {
        if (originalToastModule) {
            require.cache[toastPath] = originalToastModule;
        } else {
            delete require.cache[toastPath];
        }
        resetModule(handlerPath);

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
    }
});

test('image extraction notifies when LLM API key is missing', async () => {
    const flowId = 'flow-missing-api-key';
    const settingsDir = await makeTempSettingsDir();
    await writeSettings(settingsDir, { llm_provider: { provider: 'gemini', api_key: '' } });

    const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR;
    const previousMock = process.env.JIMINY_LLM_MOCK;
    process.env.JIMINY_SETTINGS_DIR = settingsDir;
    delete process.env.JIMINY_LLM_MOCK;

    const toastPath = require.resolve('../src/toast');
    const handlerPath = require.resolve('../src/extraction/image/handler');
    const originalToastModule = require.cache[toastPath];

    const toastCalls = [];
    mockModule(toastPath, {
        showToast: (payload) => toastCalls.push(payload),
    });

    resetModule(handlerPath);

    try {
        const { handleImageExtractionEvent } = require('../src/extraction/image/handler');
        const result = await handleImageExtractionEvent({ metadata: { path: '/tmp/fake.png' }, flow_id: flowId });

        assert.deepEqual(result, { skipped: true, reason: 'missing_api_key' });
        assert.equal(toastCalls.length, 1);
        assert.equal(toastCalls[0].title, 'LLM API key required');
    } finally {
        if (originalToastModule) {
            require.cache[toastPath] = originalToastModule;
        } else {
            delete require.cache[toastPath];
        }
        resetModule(handlerPath);

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
    }
});
