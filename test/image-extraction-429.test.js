const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { RetryableError } = require('../src/utils/retry');

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

test('image extraction notifies and skips on exhausted provider', async (t) => {
    const flowId = 'flow-provider-exhausted';
    const settingsDir = await makeTempSettingsDir();
    const settingsPath = path.join(settingsDir, 'settings.json');
    await fs.writeFile(
        settingsPath,
        JSON.stringify(
            {
                llm_provider: { provider: 'gemini', api_key: 'test-key' },
            },
            null,
            2
        ),
        'utf-8'
    );

    const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR;
    process.env.JIMINY_SETTINGS_DIR = settingsDir;

    const indexPath = require.resolve('../src/extraction/image/index');
    const handlerPath = require.resolve('../src/extraction/image/handler');
    const toastPath = require.resolve('../src/toast');

    const originalIndexModule = require.cache[indexPath];
    const originalToastModule = require.cache[toastPath];

    let toastCalled = false;

    mockModule(indexPath, {
        DEFAULT_VISION_MODEL: 'gemini-2.5-flash',
        runImageExtraction: async () => {
            throw new RetryableError({ status: 429, message: 'rate limited' });
        },
    });

    mockModule(toastPath, {
        showToast: () => {
            toastCalled = true;
        },
    });

    resetModule(handlerPath);

    try {
        const { handleImageExtractionEvent } = require('../src/extraction/image/handler');

        const result = await handleImageExtractionEvent({ metadata: { path: '/tmp/fake.png' }, flow_id: flowId });

        assert.deepEqual(result, { skipped: true, reason: 'provider_exhausted' });
        assert.equal(toastCalled, true);
    } finally {
        if (originalIndexModule) {
            require.cache[indexPath] = originalIndexModule;
        } else {
            delete require.cache[indexPath];
        }

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
    }
});
