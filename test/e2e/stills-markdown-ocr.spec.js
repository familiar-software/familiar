const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../../src/const')

const buildLaunchArgs = () => {
  const launchArgs = ['.']
  if (process.platform === 'linux') {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }
  return launchArgs
}

const launchApp = async ({ contextPath, settingsDir, env = {} }) => {
  const appRoot = path.join(__dirname, '../..')
  return electron.launch({
    args: buildLaunchArgs(),
    cwd: appRoot,
    env: {
      ...process.env,
      FAMILIAR_E2E: '1',
      FAMILIAR_E2E_CONTEXT_PATH: contextPath,
      FAMILIAR_SETTINGS_DIR: settingsDir,
      ...env
    }
  })
}

const stillsRootForContext = (contextPath) =>
  path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)

const markdownRootForContext = (contextPath) =>
  path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME)

test('stills markdown worker uses local Apple Vision OCR helper (native binary)', async () => {
  if (process.platform !== 'darwin') {
    test.skip(true, 'Apple Vision OCR is only supported on macOS.')
  }

  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-md-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
  const appRoot = path.join(__dirname, '../..')
  const ocrBinaryPath = path.join(appRoot, 'scripts', 'bin', 'familiar-ocr-helper')

  expect(fs.existsSync(ocrBinaryPath)).toBe(true)

  // Compute these up-front so we can pass them via env (avoids flaky Playwright arg serialization in electronApp.evaluate).
  const sessionId = `session-e2e-${Date.now()}`
  const capturedAt = new Date().toISOString()
  const fileBase = `capture-${Date.now()}`
  const stillPath = path.join(stillsRootForContext(contextPath), sessionId, `${fileBase}.webp`)
  const expectedMarkdownPath = path.join(markdownRootForContext(contextPath), sessionId, `${fileBase}.md`)

  const electronApp = await launchApp({
    contextPath,
    settingsDir,
    env: {
      FAMILIAR_APPLE_VISION_OCR_BINARY: ocrBinaryPath,
      FAMILIAR_E2E_OCR_SESSION_ID: sessionId,
      FAMILIAR_E2E_OCR_CAPTURED_AT: capturedAt,
      FAMILIAR_E2E_OCR_FILE_BASE: fileBase
    }
  })

  try {
    // Ensure the app is fully up (main process is ready and modules are loaded).
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Generate a valid WebP payload using Chromium's encoder. (1x1 sometimes fails Vision.)
    const base64Webp = await window.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to create canvas context')
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp'))
      if (!blob) {
        throw new Error('Failed to encode WebP blob')
      }

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Failed to read WebP data URL'))
        reader.readAsDataURL(blob)
      })

      const parts = String(dataUrl).split(',')
      return parts.length > 1 ? parts[1] : ''
    })
    expect(base64Webp).toBeTruthy()

    // Write the still from the test runner (Node), not inside electronApp.evaluate.
    // Playwright's electronApp.evaluate argument passing has been flaky for larger payloads.
    fs.mkdirSync(path.dirname(stillPath), { recursive: true })
    fs.writeFileSync(stillPath, Buffer.from(base64Webp, 'base64'))

    await electronApp.evaluate(async () => {
        // Playwright's Electron evaluate environment doesn't expose `require` directly.
        // Use Electron main's module loader instead.
        const pathLocal = process.mainModule.require('node:path')
        const { app } = process.mainModule.require('electron')

        const contextPathLocal = process.env.FAMILIAR_E2E_CONTEXT_PATH
        if (typeof contextPathLocal !== 'string' || !contextPathLocal) {
          throw new Error(`Missing FAMILIAR_E2E_CONTEXT_PATH (got ${typeof contextPathLocal}).`)
        }

        const sessionId = process.env.FAMILIAR_E2E_OCR_SESSION_ID
        const capturedAt = process.env.FAMILIAR_E2E_OCR_CAPTURED_AT
        const fileBase = process.env.FAMILIAR_E2E_OCR_FILE_BASE

        if (typeof sessionId !== 'string' || !sessionId) {
          throw new Error(`Missing FAMILIAR_E2E_OCR_SESSION_ID (got ${typeof sessionId}).`)
        }
        if (typeof capturedAt !== 'string' || !capturedAt) {
          throw new Error(`Missing FAMILIAR_E2E_OCR_CAPTURED_AT (got ${typeof capturedAt}).`)
        }
        if (typeof fileBase !== 'string' || !fileBase) {
          throw new Error(`Missing FAMILIAR_E2E_OCR_FILE_BASE (got ${typeof fileBase}).`)
        }

        const resolvedAppRoot = app.getAppPath()
        if (typeof resolvedAppRoot !== 'string' || !resolvedAppRoot) {
          throw new Error(`Missing Electron app path (got ${typeof resolvedAppRoot}).`)
        }

        const resolvedStillPath = pathLocal.join(
          contextPathLocal,
          'familiar',
          'stills',
          sessionId,
          `${fileBase}.webp`
        )

        if (typeof resolvedStillPath !== 'string' || !resolvedStillPath) {
          throw new Error(`Missing still path (got ${typeof resolvedStillPath}).`)
        }

        const { createStillsQueue } = process.mainModule.require(
          pathLocal.join(resolvedAppRoot, 'src', 'screen-stills', 'stills-queue.js')
        )
        const { createStillsMarkdownWorker } = process.mainModule.require(
          pathLocal.join(resolvedAppRoot, 'src', 'screen-stills', 'stills-markdown-worker.js')
        )

        const queue = createStillsQueue({ contextFolderPath: contextPathLocal, logger: console })
        queue.enqueueCapture({
          imagePath: resolvedStillPath,
          sessionId,
          capturedAt
        })

        const worker = createStillsMarkdownWorker({
          logger: console,
          pollIntervalMs: 150,
          maxBatchesPerTick: 1,
          runImmediately: true
        })

        // Keep a handle for cleanup.
        global.__familiarE2EStillsMarkdownWorker = worker
        worker.start({ contextFolderPath: contextPathLocal })
      })

    await expect.poll(() => fs.existsSync(expectedMarkdownPath), { timeout: 30000 }).toBe(true)

    const markdown = fs.readFileSync(expectedMarkdownPath, 'utf-8')
    expect(markdown).toContain('format: familiar-layout-v0')
    expect(markdown).toContain('extractor: apple-vision-ocr')
    expect(markdown).toContain('# OCR')
    // Stable fallback from buildMarkdownLayoutFromOcr when OCR emits zero lines.
    expect(markdown).toContain('NO_TEXT_DETECTED')
  } finally {
    await electronApp.evaluate(() => {
      const worker = global.__familiarE2EStillsMarkdownWorker
      if (worker && typeof worker.stop === 'function') {
        worker.stop()
      }
      global.__familiarE2EStillsMarkdownWorker = null
    })
    await electronApp.close()
  }
})

test('stills markdown worker redacts secrets in mocked LLM output before persisting', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-redaction-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-stills-redaction-'))
  fs.writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify(
      {
        wizardCompleted: true,
        contextFolderPath: contextPath,
        stills_markdown_extractor: {
          type: 'llm',
          llm_provider: {
            provider: 'openai',
            api_key: 'test'
          }
        }
      },
      null,
      2
    ),
    'utf-8'
  )

  const mockText = [
    'format: familiar-layout-v0',
    'extractor: llm-mock',
    '# OCR',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    'api_key = "abcDEF1234567890XYZ_+-/="',
    'password = "mysecretpass"',
    'openai=sk-abcdefghijklmnopqrstuvwxyz123456'
  ].join('\n')

  const sessionId = `session-e2e-redaction-${Date.now()}`
  const capturedAt = new Date().toISOString()
  const fileBase = `capture-${Date.now()}`
  const stillPath = path.join(stillsRootForContext(contextPath), sessionId, `${fileBase}.webp`)
  const expectedMarkdownPath = path.join(markdownRootForContext(contextPath), sessionId, `${fileBase}.md`)

  const electronApp = await launchApp({
    contextPath,
    settingsDir,
    env: {
      FAMILIAR_LLM_MOCK: '1',
      FAMILIAR_LLM_MOCK_TEXT: mockText,
      FAMILIAR_E2E_OCR_SESSION_ID: sessionId,
      FAMILIAR_E2E_OCR_CAPTURED_AT: capturedAt,
      FAMILIAR_E2E_OCR_FILE_BASE: fileBase
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const base64Webp = await window.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to create canvas context')
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp'))
      if (!blob) {
        throw new Error('Failed to encode WebP blob')
      }

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Failed to read WebP data URL'))
        reader.readAsDataURL(blob)
      })

      const parts = String(dataUrl).split(',')
      return parts.length > 1 ? parts[1] : ''
    })
    expect(base64Webp).toBeTruthy()

    fs.mkdirSync(path.dirname(stillPath), { recursive: true })
    fs.writeFileSync(stillPath, Buffer.from(base64Webp, 'base64'))

    await electronApp.evaluate(async () => {
      const pathLocal = process.mainModule.require('node:path')
      const { app } = process.mainModule.require('electron')
      const contextPathLocal = process.env.FAMILIAR_E2E_CONTEXT_PATH
      const sessionIdLocal = process.env.FAMILIAR_E2E_OCR_SESSION_ID
      const capturedAtLocal = process.env.FAMILIAR_E2E_OCR_CAPTURED_AT
      const fileBaseLocal = process.env.FAMILIAR_E2E_OCR_FILE_BASE
      const resolvedAppRoot = app.getAppPath()

      const resolvedStillPath = pathLocal.join(
        contextPathLocal,
        'familiar',
        'stills',
        sessionIdLocal,
        `${fileBaseLocal}.webp`
      )

      const { createStillsQueue } = process.mainModule.require(
        pathLocal.join(resolvedAppRoot, 'src', 'screen-stills', 'stills-queue.js')
      )
      const { createStillsMarkdownWorker } = process.mainModule.require(
        pathLocal.join(resolvedAppRoot, 'src', 'screen-stills', 'stills-markdown-worker.js')
      )

      const queue = createStillsQueue({ contextFolderPath: contextPathLocal, logger: console })
      queue.enqueueCapture({
        imagePath: resolvedStillPath,
        sessionId: sessionIdLocal,
        capturedAt: capturedAtLocal
      })

      const worker = createStillsMarkdownWorker({
        logger: console,
        pollIntervalMs: 150,
        maxBatchesPerTick: 1,
        runImmediately: true
      })

      global.__familiarE2EStillsMarkdownWorker = worker
      worker.start({ contextFolderPath: contextPathLocal })
    })

    await expect.poll(() => fs.existsSync(expectedMarkdownPath), { timeout: 30000 }).toBe(true)

    const markdown = fs.readFileSync(expectedMarkdownPath, 'utf-8')
    expect(markdown).toContain('[REDACTED:auth_bearer]')
    expect(markdown).toContain('api_key = "[REDACTED:generic_api_assignment]"')
    expect(markdown).toContain('password = "[REDACTED:password_assignment]"')
    expect(markdown).toContain('[REDACTED:openai_sk]')
    expect(markdown).not.toContain('Bearer abcdefghijklmnopqrstuvwxyz012345')
    expect(markdown).not.toContain('abcDEF1234567890XYZ_+-/=')
    expect(markdown).not.toContain('mysecretpass')
    expect(markdown).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
  } finally {
    await electronApp.evaluate(() => {
      const worker = global.__familiarE2EStillsMarkdownWorker
      if (worker && typeof worker.stop === 'function') {
        worker.stop()
      }
      global.__familiarE2EStillsMarkdownWorker = null
    })
    await electronApp.close()
  }
})
