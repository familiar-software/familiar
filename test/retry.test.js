const { test } = require('node:test')
const assert = require('node:assert/strict')

const { retry, withRetry, computeBackoffDelay, withHttpRetry } = require('../utils/retry')

test('retry resolves after transient failures', async () => {
  let attempts = 0
  const delays = []

  const result = await retry(
    async () => {
      attempts += 1
      if (attempts < 3) {
        throw new Error('boom')
      }
      return 'ok'
    },
    {
      retries: 4,
      minDelayMs: 100,
      backoffFactor: 2,
      jitter: 'none',
      sleep: async (delayMs) => {
        delays.push(delayMs)
      }
    }
  )

  assert.equal(result, 'ok')
  assert.equal(attempts, 3)
  assert.deepEqual(delays, [100, 200])
})

test('retry stops when shouldRetry returns false', async () => {
  let attempts = 0
  const error = new Error('fatal')

  await assert.rejects(
    () => retry(
      async () => {
        attempts += 1
        throw error
      },
      {
        retries: 3,
        shouldRetry: () => false,
        sleep: async () => {}
      }
    ),
    (err) => {
      assert.equal(err, error)
      return true
    }
  )

  assert.equal(attempts, 1)
})

test('withRetry decorates function and preserves args', async () => {
  let attempts = 0

  const wrapped = withRetry(
    async (value) => {
      attempts += 1
      if (attempts < 2) {
        throw new Error('fail')
      }
      return value * 2
    },
    {
      retries: 2,
      minDelayMs: 50,
      jitter: 'none',
      sleep: async () => {}
    }
  )

  const result = await wrapped(5)

  assert.equal(result, 10)
  assert.equal(attempts, 2)
})

test('computeBackoffDelay applies jitter strategies', () => {
  const base = {
    attempt: 1,
    minDelayMs: 100,
    maxDelayMs: 1000,
    backoffFactor: 2,
    random: () => 0.5
  }

  assert.equal(computeBackoffDelay({ ...base, jitter: 'none' }), 100)
  assert.equal(computeBackoffDelay({ ...base, jitter: 'full' }), 50)
  assert.equal(computeBackoffDelay({ ...base, jitter: 'equal' }), 75)
})

test('withHttpRetry retries on retryable status', async () => {
  let calls = 0
  const fetchStub = async () => {
    calls += 1
    if (calls < 2) {
      return {
        ok: false,
        status: 500,
        text: async () => 'server error'
      }
    }

    return {
      ok: true,
      status: 200,
      text: async () => ''
    }
  }

  const retryingFetch = withHttpRetry(fetchStub)
  const response = await retryingFetch('https://example.com')

  assert.equal(response.ok, true)
  assert.equal(calls, 2)
})

test('withHttpRetry does not retry non-retryable status', async () => {
  let calls = 0
  const fetchStub = async () => {
    calls += 1
    return {
      ok: false,
      status: 400,
      text: async () => 'bad request'
    }
  }

  const retryingFetch = withHttpRetry(fetchStub)
  const response = await retryingFetch('https://example.com')

  assert.equal(response.status, 400)
  assert.equal(calls, 1)
})
