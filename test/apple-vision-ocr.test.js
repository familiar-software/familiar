const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  AppleVisionOcrTimeoutError,
  runAppleVisionOcrBinary
} = require('../src/ocr/apple-vision-ocr')

const OCR_JSON = JSON.stringify({ meta: { level: 'accurate' }, lines: ['hello'] })

// Fake OCR helper: counts invocations, then runs `body`. `exec sleep` mimics the Vision hang
// without leaving a shell parent behind when the helper is SIGKILLed.
const createFakeHelper = (body) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-ocr-helper-stub-'))
  const counterPath = path.join(dir, 'count')
  const helperPath = path.join(dir, 'familiar-ocr-helper')
  fs.writeFileSync(
    helperPath,
    [
      '#!/bin/sh',
      `count=$(cat '${counterPath}' 2>/dev/null || echo 0)`,
      'count=$((count + 1))',
      `echo "$count" > '${counterPath}'`,
      body,
      ''
    ].join('\n'),
    'utf-8'
  )
  fs.chmodSync(helperPath, 0o755)
  return {
    helperPath,
    readCount: () => Number(fs.readFileSync(counterPath, 'utf-8').trim()),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true })
  }
}

const createTestLogger = () => {
  const warnings = []
  return {
    warnings,
    log: () => {},
    warn: (message, payload) => warnings.push({ message, payload }),
    error: () => {}
  }
}

test('runAppleVisionOcrBinary kills a hung helper and retries until it succeeds', async () => {
  const helper = createFakeHelper(
    [`if [ "$count" -eq 1 ]; then exec sleep 30; fi`, `echo '${OCR_JSON}'`].join('\n')
  )
  const logger = createTestLogger()
  try {
    const result = await runAppleVisionOcrBinary({
      binaryPath: helper.helperPath,
      imagePath: '/tmp/still.webp',
      timeoutMs: 500,
      timeoutRetries: 2,
      logger
    })

    assert.deepEqual(result.lines, ['hello'])
    assert.equal(helper.readCount(), 2)
    assert.equal(logger.warnings.length, 1)
    assert.equal(logger.warnings[0].payload.willRetry, true)
  } finally {
    helper.cleanup()
  }
})

test('runAppleVisionOcrBinary fails with a timeout error once retries are exhausted', async () => {
  const helper = createFakeHelper('exec sleep 30')
  const logger = createTestLogger()
  try {
    await assert.rejects(
      runAppleVisionOcrBinary({
        binaryPath: helper.helperPath,
        imagePath: '/tmp/still.webp',
        timeoutMs: 300,
        timeoutRetries: 2,
        logger
      }),
      (error) => {
        assert.ok(error instanceof AppleVisionOcrTimeoutError)
        assert.equal(error.code, 'APPLE_VISION_OCR_TIMEOUT')
        assert.equal(error.attempts, 3)
        assert.match(error.message, /timed out after 300ms \(3 attempts\)/)
        return true
      }
    )
    assert.equal(helper.readCount(), 3)
    assert.equal(logger.warnings.length, 3)
  } finally {
    helper.cleanup()
  }
})

test('runAppleVisionOcrBinary does not retry helper failures that are not timeouts', async () => {
  const helper = createFakeHelper(['echo "vision failed" >&2', 'exit 1'].join('\n'))
  const logger = createTestLogger()
  try {
    await assert.rejects(
      runAppleVisionOcrBinary({
        binaryPath: helper.helperPath,
        imagePath: '/tmp/still.webp',
        timeoutMs: 5000,
        timeoutRetries: 2,
        logger
      }),
      (error) => {
        assert.ok(!(error instanceof AppleVisionOcrTimeoutError))
        assert.equal(error.code, 1)
        return true
      }
    )
    assert.equal(helper.readCount(), 1)
    assert.equal(logger.warnings.length, 0)
  } finally {
    helper.cleanup()
  }
})
