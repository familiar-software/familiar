const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

test('sync now builds context graph with mocked summaries', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context-graph')
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

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('button', { name: 'Choose...' }).click()
    await window.locator('#context-folder-save').click()

    await window.getByRole('button', { name: 'Sync now' }).click()
    await expect(window.locator('#context-graph-status')).toHaveText(/Sync complete/)

    const graphPath = path.join(settingsDir, 'context-tree.json')
    await expect.poll(() => fs.existsSync(graphPath)).toBe(true)

    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'))
    const fileNodes = Object.values(graph.nodes).filter((node) => node.type === 'file')
    expect(fileNodes.length).toBeGreaterThan(0)
    expect(fileNodes[0].summary).toBe('gibberish')
  } finally {
    await electronApp.close()
  }
})
