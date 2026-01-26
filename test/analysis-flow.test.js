const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { analysisQueue } = require('../src/analysis');
const { handleImageExtractionEvent } = require('../src/extraction/image/handler');

const makeTempDir = async (prefix) => fs.mkdtemp(path.join(os.tmpdir(), prefix));

const makeFakeImageFile = async () => {
    const dir = await makeTempDir('jiminy-image-');
    const imagePath = path.join(dir, 'image.png');
    await fs.writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return imagePath;
};

test('image extraction enqueues analysis event with result md path', async () => {
    const flowId = 'flow-test-123';
    const previousMock = process.env.JIMINY_LLM_MOCK;
    const previousMockText = process.env.JIMINY_LLM_MOCK_TEXT;
    const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR;
    process.env.JIMINY_LLM_MOCK = '1';
    process.env.JIMINY_LLM_MOCK_TEXT = 'mock extraction';

    const imagePath = await makeFakeImageFile();
    const settingsDir = await makeTempDir('jiminy-settings-');
    process.env.JIMINY_SETTINGS_DIR = settingsDir;
    await fs.writeFile(
        path.join(settingsDir, 'settings.json'),
        JSON.stringify(
            {
                llm_provider: { provider: 'gemini', api_key: '' },
            },
            null,
            2
        ),
        'utf-8'
    );

    let capturedEvent = null;
    const handlerPromise = new Promise((resolve) => {
        analysisQueue.on((event) => {
            capturedEvent = event;
            resolve();
            return { ok: true };
        });
    });

    try {
        const result = await handleImageExtractionEvent({ metadata: { path: imagePath }, flow_id: flowId });
        await handlerPromise;

        assert.ok(result.outputPath);
        assert.equal(capturedEvent.result_md_path, result.outputPath);
        assert.equal(capturedEvent.flow_id, flowId);
    } finally {
        analysisQueue.clearHandlers();
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
        if (typeof previousSettingsDir === 'undefined') {
            delete process.env.JIMINY_SETTINGS_DIR;
        } else {
            process.env.JIMINY_SETTINGS_DIR = previousSettingsDir;
        }
    }
});
