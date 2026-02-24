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

const toSessionId = (date) => `session-${date.toISOString().replace(/[:.]/g, '-')}`

test('delete files with 15 minute window removes only recent stills and stills-markdown files', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-storage-e2e-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-storage-e2e-'))

  const now = new Date()
  const oldSessionId = toSessionId(new Date(now.getTime() - 2 * 60 * 60 * 1000))
  const newestSessionId = toSessionId(new Date(now.getTime() - 1 * 60 * 60 * 1000))

  const oldStillsSessionDir = path.join(contextPath, 'familiar', 'stills', oldSessionId)
  const newestStillsSessionDir = path.join(contextPath, 'familiar', 'stills', newestSessionId)
  const oldMarkdownSessionDir = path.join(contextPath, 'familiar', 'stills-markdown', oldSessionId)
  const newestMarkdownSessionDir = path.join(
    contextPath,
    'familiar',
    'stills-markdown',
    newestSessionId
  )
  fs.mkdirSync(oldStillsSessionDir, { recursive: true })
  fs.mkdirSync(newestStillsSessionDir, { recursive: true })
  fs.mkdirSync(oldMarkdownSessionDir, { recursive: true })
  fs.mkdirSync(newestMarkdownSessionDir, { recursive: true })

  const oldDate = new Date(now.getTime() - 40 * 60 * 1000)
  const recentDate = new Date(now.getTime() - 10 * 60 * 1000)

  const oldStill = createCaptureFile(newestStillsSessionDir, oldDate, 'webp', 'old-still')
  const recentStill = createCaptureFile(oldStillsSessionDir, recentDate, 'webp', 'recent-still')
  const oldMarkdown = createCaptureFile(newestMarkdownSessionDir, oldDate, 'md', 'old-markdown')
  const recentMarkdown = createCaptureFile(oldMarkdownSessionDir, recentDate, 'md', 'recent-markdown')
  const oldClipboard = createClipboardMirrorFile(newestMarkdownSessionDir, oldDate, 'old-clipboard')
  const recentClipboard = createClipboardMirrorFile(
    oldMarkdownSessionDir,
    recentDate,
    'recent-clipboard'
  )

  fs.writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify(
      {
        wizardCompleted: true,
        contextFolderPath: contextPath,
        storageAutoCleanupRetentionDays: 7
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

    await expect(window.locator('#storage-delete-files-status')).toHaveText(
      'Deleted files from last 15 minutes'
    )

    await expect.poll(() => fs.existsSync(oldStill.fullPath)).toBe(true)
    await expect.poll(() => fs.existsSync(oldMarkdown.fullPath)).toBe(true)
    await expect.poll(() => fs.existsSync(oldClipboard.fullPath)).toBe(true)
    await expect.poll(() => fs.existsSync(recentStill.fullPath)).toBe(false)
    await expect.poll(() => fs.existsSync(recentMarkdown.fullPath)).toBe(false)
    await expect.poll(() => fs.existsSync(recentClipboard.fullPath)).toBe(false)
    await expect.poll(() => fs.existsSync(oldStillsSessionDir)).toBe(false)
    await expect.poll(() => fs.existsSync(oldMarkdownSessionDir)).toBe(false)
    await expect.poll(() => fs.existsSync(newestStillsSessionDir)).toBe(true)
    await expect.poll(() => fs.existsSync(newestMarkdownSessionDir)).toBe(true)
  } finally {
    await electronApp.close()
  }
})

test('startup auto cleanup removes old stills session folders and leaves stills-markdown untouched', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-auto-cleanup-e2e-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-auto-cleanup-e2e-'))

  const now = Date.now()
  const oldSessionId = toSessionId(new Date(now - 8 * 24 * 60 * 60 * 1000))
  const recentSessionId = toSessionId(new Date(now - 2 * 24 * 60 * 60 * 1000))
  const oldStillsSessionDir = path.join(contextPath, 'familiar', 'stills', oldSessionId)
  const recentStillsSessionDir = path.join(contextPath, 'familiar', 'stills', recentSessionId)
  const oldMarkdownSessionDir = path.join(contextPath, 'familiar', 'stills-markdown', oldSessionId)
  const recentMarkdownSessionDir = path.join(
    contextPath,
    'familiar',
    'stills-markdown',
    recentSessionId
  )
  const invalidSessionDir = path.join(contextPath, 'familiar', 'stills', 'session-invalid')
  const nonSessionDir = path.join(contextPath, 'familiar', 'stills-markdown', 'notes')

  fs.mkdirSync(oldStillsSessionDir, { recursive: true })
  fs.mkdirSync(recentStillsSessionDir, { recursive: true })
  fs.mkdirSync(oldMarkdownSessionDir, { recursive: true })
  fs.mkdirSync(recentMarkdownSessionDir, { recursive: true })
  fs.mkdirSync(invalidSessionDir, { recursive: true })
  fs.mkdirSync(nonSessionDir, { recursive: true })
  fs.writeFileSync(path.join(oldStillsSessionDir, 'old.webp'), 'old', 'utf-8')
  fs.writeFileSync(path.join(oldMarkdownSessionDir, 'old.md'), 'old', 'utf-8')

  fs.writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify(
      {
        wizardCompleted: true,
        contextFolderPath: contextPath,
        storageAutoCleanupRetentionDays: 7
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
      FAMILIAR_E2E_CONTEXT_PATH: contextPath,
      FAMILIAR_SETTINGS_DIR: settingsDir
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expect.poll(() => fs.existsSync(oldStillsSessionDir)).toBe(false)
    await expect.poll(() => fs.existsSync(oldMarkdownSessionDir)).toBe(true)
    await expect.poll(() => fs.existsSync(recentStillsSessionDir)).toBe(true)
    await expect.poll(() => fs.existsSync(recentMarkdownSessionDir)).toBe(true)
    await expect.poll(() => fs.existsSync(invalidSessionDir)).toBe(true)
    await expect.poll(() => fs.existsSync(nonSessionDir)).toBe(true)
    await expect.poll(() => {
      const settingsPath = path.join(settingsDir, 'settings.json')
      if (!fs.existsSync(settingsPath)) {
        return null
      }
      const loaded = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      return typeof loaded.storageAutoCleanupLastRunAt === 'number'
    }).toBe(true)
  } finally {
    await electronApp.close()
  }
})
