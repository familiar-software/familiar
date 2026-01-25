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

    await window.locator('#context-folder-choose').click()
    await window.locator('#llm-provider').selectOption('gemini')
    await window.locator('#llm-api-key-save').click()
    const statsLocator = window.locator('#context-graph-stats')
    // Before sync: no stored graph, so all nodes are "new"
    await expect(statsLocator).toHaveText(`Synced: 0/${expectedTotalNodes} | Out of sync: 0/${expectedTotalNodes} | New: ${expectedTotalNodes}`)
    await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

    await window.getByRole('button', { name: 'Sync now' }).click()
    await expect(window.locator('#context-graph-status')).toHaveText(/Sync complete/)
    // After sync: all nodes are now synced
    await expect(statsLocator).toHaveText(`Synced: ${expectedTotalNodes}/${expectedTotalNodes} | Out of sync: 0/${expectedTotalNodes} | New: 0`)

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
