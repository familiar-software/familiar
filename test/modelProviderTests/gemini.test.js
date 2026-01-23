const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createGeminiSummarizer, DEFAULT_MODEL, ExhaustedLlmProviderError } = require('../../llms');
const { createModelProviderClients } = require('../../modelProviders');

const liveApiKey = process.env.LLM_API_KEY;

if (!liveApiKey) {
    test('gemini provider returns text from live API', { skip: 'LLM_API_KEY not set' }, () => {});
} else {
    test('gemini provider returns text from live API', async () => {
        const provider = createModelProviderClients({ provider: 'gemini', apiKey: liveApiKey });
        const result = await provider.text.generate('Reply with exactly the word: OK');

        assert.ok(result);
        assert.match(result, /\bok\b/i);
    });
}

test('gemini summarizer returns text from provider', async (t) => {
    const originalFetch = global.fetch;
    t.after(() => {
        global.fetch = originalFetch;
    });

    global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            candidates: [{ content: { parts: [{ text: 'summary from mock' }] } }],
        }),
        text: async () => '',
    });

    const summarizer = createGeminiSummarizer({ apiKey: 'test-key', model: DEFAULT_MODEL });
    const summary = await summarizer.summarizeFile({
        relativePath: 'smoke.md',
        content: 'This is a short test file used to verify Gemini summaries.',
    });

    assert.equal(summary, 'summary from mock');
});

test('gemini summarizer throws exhausted error on 429', async (t) => {
    const originalFetch = global.fetch;
    t.after(() => {
        global.fetch = originalFetch;
    });

    let fetchCalls = 0;
    global.fetch = async () => {
        fetchCalls += 1;
        return {
            ok: false,
            status: 429,
            json: async () => ({}),
            text: async () => 'rate limited',
        };
    };

    const summarizer = createGeminiSummarizer({ apiKey: 'test-key', model: DEFAULT_MODEL });

    await assert.rejects(
        () =>
            summarizer.summarizeFile({
                relativePath: 'smoke.md',
                content: 'This is a short test file used to verify Gemini summaries.',
            }),
        (error) => {
            assert.ok(error instanceof ExhaustedLlmProviderError);
            assert.equal(error.code, 'exhaustedLlmProvider');
            return true;
        }
    );

    assert.ok(fetchCalls > 1);
});

test('gemini summarizer retries on transient errors', async (t) => {
    const originalFetch = global.fetch;
    t.after(() => {
        global.fetch = originalFetch;
    });

    let fetchCalls = 0;
    global.fetch = async () => {
        fetchCalls += 1;
        if (fetchCalls < 2) {
            return {
                ok: false,
                status: 500,
                json: async () => ({}),
                text: async () => 'server error',
            };
        }

        return {
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [{ content: { parts: [{ text: 'summary after retry' }] } }],
            }),
            text: async () => '',
        };
    };

    const summarizer = createGeminiSummarizer({ apiKey: 'test-key', model: DEFAULT_MODEL });

    const summary = await summarizer.summarizeFile({
        relativePath: 'smoke.md',
        content: 'This is a short test file used to verify Gemini summaries.',
    });

    assert.equal(summary, 'summary after retry');
    assert.equal(fetchCalls, 2);
});
