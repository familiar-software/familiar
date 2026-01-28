const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const { constructContextGraphSkeleton } = require('../../src/context-graph/graphSkeleton')
const { JIMINY_BEHIND_THE_SCENES_DIR_NAME } = require('../../src/const')

test('sync now builds context graph with mocked summaries', async () => {
  const appRoot = path.join(__dirname, '../..')
  const fixturePath = path.join(appRoot, 'test', 'fixtures', 'context-graph')
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-e2e-'))
  fs.cpSync(fixturePath, contextPath, { recursive: true })
  const existingGraphPath = path.join(contextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, 'context-tree.json')
  if (fs.existsSync(existingGraphPath)) {
    fs.unlinkSync(existingGraphPath)
  }
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
      JIMINY_SETTINGS_DIR: settingsDir,
      JIMINY_LLM_MOCK: '1',
      JIMINY_LLM_MOCK_TEXT: 'gibberish'
    }
  })

  const scanResult = constructContextGraphSkeleton(contextPath, { exclusions: [] })
  const expectedTotalNodes = scanResult.counts.files + scanResult.counts.folders

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.getByRole('tab', { name: 'General' }).click()

    await window.locator('#context-folder-choose').click()
    await window.locator('#llm-provider').selectOption('gemini')
    await window.locator('#llm-api-key').fill('test-key')
    await window.locator('#llm-api-key').blur()
    await expect(window.locator('#llm-api-key-status')).toHaveText('Saved.')
    await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

    await window.getByRole('tab', { name: 'Graph' }).click()
    await expect(window.locator('#context-graph-percent')).toHaveText('0%')
    await expect(window.locator('#context-graph-new-count')).toHaveText(`${expectedTotalNodes}`)
    await expect(window.locator('#context-graph-synced-count')).toHaveText('0')

    await window.getByRole('button', { name: 'Sync now' }).click()
    await expect(window.locator('#context-graph-status')).toHaveText(/Sync complete/)
    // After sync: all nodes are now synced
    await expect(window.locator('#context-graph-percent')).toHaveText('100%')
    await expect(window.locator('#context-graph-new-count')).toHaveText('0')
    await expect(window.locator('#context-graph-synced-count')).toHaveText(`${expectedTotalNodes}`)

    const graphPath = path.join(contextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, 'context-tree.json')
    await expect.poll(() => fs.existsSync(graphPath)).toBe(true)

    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'))
    const fileNodes = Object.values(graph.nodes).filter((node) => node.type === 'file')
    expect(fileNodes.length).toBeGreaterThan(0)
    expect(fileNodes[0].summary).toBe('gibberish')
  } finally {
    await electronApp.close()
  }
})

test('graph tab refreshes counts after adding a file', async () => {
  const appRoot = path.join(__dirname, '../..')
  const fixturePath = path.join(appRoot, 'test', 'fixtures', 'context-graph')
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-refresh-'))
  fs.cpSync(fixturePath, contextPath, { recursive: true })
  const existingGraphPath = path.join(contextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, 'context-tree.json')
  if (fs.existsSync(existingGraphPath)) {
    fs.unlinkSync(existingGraphPath)
  }
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-refresh-'))
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
      JIMINY_SETTINGS_DIR: settingsDir,
      JIMINY_LLM_MOCK: '1',
      JIMINY_LLM_MOCK_TEXT: 'gibberish'
    }
  })

  const baselineScan = constructContextGraphSkeleton(contextPath, { exclusions: [] })
  const baselineTotal = baselineScan.counts.files + baselineScan.counts.folders

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.getByRole('tab', { name: 'General' }).click()

    await window.locator('#context-folder-choose').click()
    await window.locator('#llm-provider').selectOption('gemini')
    await window.locator('#llm-api-key').fill('test-key')
    await window.locator('#llm-api-key').blur()
    await expect(window.locator('#llm-api-key-status')).toHaveText('Saved.')
    await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

    await window.getByRole('tab', { name: 'Graph' }).click()
    await expect(window.locator('#context-graph-new-count')).toHaveText(`${baselineTotal}`)
    await expect(window.locator('#context-graph-synced-count')).toHaveText('0')

    const newFilePath = path.join(contextPath, 'fresh-note.md')
    fs.writeFileSync(newFilePath, 'hello', 'utf-8')
    const refreshedScan = constructContextGraphSkeleton(contextPath, { exclusions: [] })
    const refreshedTotal = refreshedScan.counts.files + refreshedScan.counts.folders

    await window.getByRole('tab', { name: 'General' }).click()
    await window.getByRole('tab', { name: 'Graph' }).click()

    await expect(window.locator('#context-graph-new-count')).toHaveText(`${refreshedTotal}`)
    await expect(window.locator('#context-graph-synced-count')).toHaveText('0')
  } finally {
    await electronApp.close()
  }
})

test('graph tab shows ignored file count', async () => {
  const appRoot = path.join(__dirname, '../..')
  const fixturePath = path.join(appRoot, 'test', 'fixtures', 'context-graph')
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-ignored-'))
  fs.cpSync(fixturePath, contextPath, { recursive: true })
  fs.writeFileSync(path.join(contextPath, 'ignored.png'), 'not an image', 'utf-8')
  const existingGraphPath = path.join(contextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, 'context-tree.json')
  if (fs.existsSync(existingGraphPath)) {
    fs.unlinkSync(existingGraphPath)
  }
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-ignored-'))
  const launchArgs = ['.']
  if (process.platform === 'linux' || process.env.CI) {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }

  const scanResult = constructContextGraphSkeleton(contextPath, { exclusions: [] })
  const expectedIgnoredFiles = Array.isArray(scanResult.ignores)
    ? scanResult.ignores.filter((ignore) => ignore?.type === 'file').length
    : 0
  expect(expectedIgnoredFiles).toBeGreaterThan(0)

  const electronApp = await electron.launch({
    args: launchArgs,
    cwd: appRoot,
    env: {
      ...process.env,
      JIMINY_E2E: '1',
      JIMINY_E2E_CONTEXT_PATH: contextPath,
      JIMINY_SETTINGS_DIR: settingsDir,
      JIMINY_LLM_MOCK: '1',
      JIMINY_LLM_MOCK_TEXT: 'gibberish'
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.getByRole('tab', { name: 'General' }).click()

    await window.locator('#context-folder-choose').click()
    await window.locator('#llm-provider').selectOption('gemini')
    await window.locator('#llm-api-key').fill('test-key')
    await window.locator('#llm-api-key').blur()
    await expect(window.locator('#llm-api-key-status')).toHaveText('Saved.')
    await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

    await window.getByRole('tab', { name: 'Graph' }).click()
    await expect(window.locator('#context-graph-ignored-count')).toHaveText(`${expectedIgnoredFiles}`)
  } finally {
    await electronApp.close()
  }
})
