const assert = require('node:assert/strict');
const { test } = require('node:test');

const { createModelProviderClients } = require('../modelProviders');

const createOkResponse = (payload) => ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => '',
});

test('openai provider generates text from chat completions', async () => {
    let capturedPayload = null;
    const originalFetch = global.fetch;
    global.fetch = async (_url, options) => {
        capturedPayload = JSON.parse(options.body);
        return createOkResponse({
            choices: [{ message: { content: 'openai summary' } }],
        });
    };

    try {
        const provider = createModelProviderClients({ provider: 'openai', apiKey: 'test-key' });
        const result = await provider.text.generate('Summarize this file.');

        assert.equal(result, 'openai summary');
        assert.equal(capturedPayload.model, 'gpt-4o-mini');
        assert.equal(capturedPayload.messages[0].role, 'user');
    } finally {
        global.fetch = originalFetch;
    }
});

test('anthropic provider generates vision text', async () => {
    let capturedPayload = null;
    const originalFetch = global.fetch;
    global.fetch = async (_url, options) => {
        capturedPayload = JSON.parse(options.body);
        return createOkResponse({
            content: [{ type: 'text', text: 'anthropic extraction' }],
        });
    };

    try {
        const provider = createModelProviderClients({ provider: 'anthropic', apiKey: 'test-key' });
        const result = await provider.vision.extract({
            prompt: 'Extract text.',
            imageBase64: 'ZmFrZQ==',
            mimeType: 'image/png',
        });

        assert.equal(result, 'anthropic extraction');
        assert.equal(capturedPayload.model, 'claude-3-5-sonnet-20240620');
        assert.equal(capturedPayload.messages[0].content[0].type, 'text');
        assert.equal(capturedPayload.messages[0].content[1].type, 'image');
    } finally {
        global.fetch = originalFetch;
    }
});
