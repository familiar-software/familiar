const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const {
  CAPTURES_DIR_NAME,
  CAPTURE_FILENAME_PREFIX,
  JIMINY_BEHIND_THE_SCENES_DIR_NAME
} = require('../../const')

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('capture flow saves a screenshot under the context folder', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-capture-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))
  const launchArgs = ['.']
  if (process.platform === 'linux' || process.env.CI) {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }

  const electronApp = await electron.launch({
    args: launchArgs,
    cwd: appRoot,
    env: {
      ...process.env,
      JIMINY_E2E: '1',
      JIMINY_E2E_CONTEXT_PATH: contextPath,
      JIMINY_SETTINGS_DIR: settingsDir
    }
  })

  try {
    await electronApp.evaluate(({ desktopCapturer, systemPreferences }) => {
      const fakeImage = {
        isEmpty: () => false,
        getSize: () => ({ width: 200, height: 200 }),
        toPNG: () => Buffer.from([0x89, 0x50, 0x4e, 0x47])
      }
      fakeImage.crop = () => fakeImage

      desktopCapturer.getSources = async () => [
        {
          id: 'mock-source',
          name: 'Mock Screen',
          display_id: '1',
          thumbnail: fakeImage
        }
      ]

      if (systemPreferences && typeof systemPreferences.getMediaAccessStatus === 'function') {
        systemPreferences.getMediaAccessStatus = () => 'granted'
      }
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('button', { name: 'Choose...' }).click()
    await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

    const overlayPromise = electronApp.waitForEvent('window')
    const captureResult = await electronApp.evaluate(async ({ app }) => {
      const capture = process.mainModule.require(`${app.getAppPath()}/screenshot/capture`)
      return capture.startCaptureFlow()
    })
    expect(captureResult.ok).toBe(true)

    const overlay = await overlayPromise
    await overlay.waitForLoadState('domcontentloaded')

    const { width, height } = await overlay.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }))

    const startX = Math.max(10, Math.floor(width * 0.1))
    const startY = Math.max(10, Math.floor(height * 0.1))
    const endX = Math.min(startX + 80, Math.max(startX + 10, width - 10))
    const endY = Math.min(startY + 80, Math.max(startY + 10, height - 10))

    await overlay.mouse.move(startX, startY)
    await overlay.mouse.down()
    await overlay.mouse.move(endX, endY)
    await overlay.mouse.up()

    // Wait for toast window to appear after capture
    const toastPromise = electronApp.waitForEvent('window')
    await overlay.waitForEvent('close')

    const toastWindow = await toastPromise
    await toastWindow.waitForLoadState('domcontentloaded')

    // Verify toast shows success message
    await expect(toastWindow.locator('#title')).toHaveText('Screenshot Captured')
    await expect(toastWindow.locator('#body')).toHaveText('Screenshot saved and queued for analysis.')

    const capturesDir = path.join(contextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, CAPTURES_DIR_NAME)
    await expect.poll(() => {
      if (!fs.existsSync(capturesDir)) {
        return 0
      }
      return fs.readdirSync(capturesDir).length
    }).toBeGreaterThan(0)

    const captureFiles = fs
      .readdirSync(capturesDir)
      .filter((filename) => filename.endsWith('.png'))
    expect(captureFiles.length).toBe(1)

    const expectedPrefix = CAPTURE_FILENAME_PREFIX ? `${CAPTURE_FILENAME_PREFIX} ` : ''
    const prefix = escapeRegExp(expectedPrefix)
    const pattern = new RegExp(
      `^${prefix}\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}-\\d{3}\\.png$`
    )
    expect(captureFiles[0]).toMatch(pattern)
  } finally {
    await electronApp.close()
  }
})
