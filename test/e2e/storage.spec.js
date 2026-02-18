const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

const toCaptureTimestamp = (date) => date.toISOString().replace(/[:.]/g, '-')

const createCaptureFile = (dirPath, date, extension, content = '') => {
  const fileName = `${toCaptureTimestamp(date)}.${extension}`
  const fullPath = path.join(dirPath, fileName)
  fs.writeFileSync(fullPath, content || fileName, 'utf-8')
  return { fileName, fullPath }
}

const createClipboardMirrorFile = (dirPath, date, content = '') => {
  const fileName = `${toCaptureTimestamp(date)}.clipboard.txt`
  const fullPath = path.join(dirPath, fileName)
  fs.writeFileSync(fullPath, content || fileName, 'utf-8')
  return { fileName, fullPath }
}

test('delete files with 15 minute window removes only recent stills and stills-markdown files', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-storage-e2e-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-storage-e2e-'))

  const stillsSessionDir = path.join(
    contextPath,
    'familiar',
    'stills',
    'session-e2e-stills'
  )
  const markdownSessionDir = path.join(
    contextPath,
    'familiar',
    'stills-markdown',
    'session-e2e-markdown'
  )
  fs.mkdirSync(stillsSessionDir, { recursive: true })
  fs.mkdirSync(markdownSessionDir, { recursive: true })

  const now = new Date()
  const oldDate = new Date(now.getTime() - (40 * 60 * 1000))
  const recentDate = new Date(now.getTime() - (10 * 60 * 1000))

  const oldStill = createCaptureFile(stillsSessionDir, oldDate, 'webp', 'old-still')
  const recentStill = createCaptureFile(stillsSessionDir, recentDate, 'webp', 'recent-still')
  const oldMarkdown = createCaptureFile(markdownSessionDir, oldDate, 'md', 'old-markdown')
  const recentMarkdown = createCaptureFile(markdownSessionDir, recentDate, 'md', 'recent-markdown')
  const oldClipboard = createClipboardMirrorFile(markdownSessionDir, oldDate, 'old-clipboard')
  const recentClipboard = createClipboardMirrorFile(markdownSessionDir, recentDate, 'recent-clipboard')

  fs.writeFileSync(
    path.join(stillsSessionDir, 'manifest.json'),
    JSON.stringify(
      {
        captures: [
          { file: oldStill.fileName, capturedAt: oldDate.toISOString() },
          { file: recentStill.fileName, capturedAt: recentDate.toISOString() }
        ]
      },
      null,
      2
    ),
    'utf-8'
  )

  fs.writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify(
      {
        wizardCompleted: true,
        contextFolderPath: contextPath
      },
      null,
      2
    ),
    'utf-8'
  )

  const launchArgs = ['.']
  if (process.platform === 'linux') {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }

  const electronApp = await electron.launch({
    args: launchArgs,
    cwd: appRoot,
    env: {
      ...process.env,
      FAMILIAR_E2E: '1',
      FAMILIAR_E2E_AUTO_CONFIRM_DELETE_FILES: '1',
      FAMILIAR_E2E_CONTEXT_PATH: contextPath,
      FAMILIAR_SETTINGS_DIR: settingsDir
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('tab', { name: 'Storage' }).click()
    const deleteWindowSelect = window.locator('#storage-delete-window')
    await deleteWindowSelect.selectOption('15m')
    const deleteButton = window.locator('#storage-delete-files')
    await expect(deleteButton).toBeEnabled()
    await deleteButton.click()

    await expect(window.locator('#storage-delete-files-status')).toHaveText('Deleted files from 15 minutes')

    await expect.poll(() => fs.existsSync(oldStill.fullPath)).toBe(true)
    await expect.poll(() => fs.existsSync(oldMarkdown.fullPath)).toBe(true)
    await expect.poll(() => fs.existsSync(oldClipboard.fullPath)).toBe(true)
    await expect.poll(() => fs.existsSync(recentStill.fullPath)).toBe(false)
    await expect.poll(() => fs.existsSync(recentMarkdown.fullPath)).toBe(false)
    await expect.poll(() => fs.existsSync(recentClipboard.fullPath)).toBe(false)

    const manifest = JSON.parse(fs.readFileSync(path.join(stillsSessionDir, 'manifest.json'), 'utf-8'))
    expect(Array.isArray(manifest.captures)).toBe(true)
    expect(manifest.captures.length).toBe(1)
    expect(manifest.captures[0].file).toBe(oldStill.fileName)
  } finally {
    await electronApp.close()
  }
})
