const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

const toTimeInputValue = (offsetMinutes) => {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

const readSettings = (settingsPath) => JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))

const readStoredHeartbeat = (settingsPath) => {
  const items = readSettings(settingsPath)?.heartbeats?.items
  return Array.isArray(items) && items.length === 1 ? items[0] : null
}

const expectStoredHeartbeat = async (settingsPath, expected) => {
  await expect
    .poll(() => {
      const storedHeartbeat = readStoredHeartbeat(settingsPath)
      if (!storedHeartbeat) {
        return null
      }

      return {
        topic: storedHeartbeat.topic,
        prompt: storedHeartbeat.prompt,
        runner: storedHeartbeat.runner,
        frequency: storedHeartbeat.schedule?.frequency,
        time: storedHeartbeat.schedule?.time,
        enabled: storedHeartbeat.enabled
      }
    })
    .toEqual(expected)
}

const scrollSettingsContent = async (window, position = 'bottom') => {
  const mainContent = window.locator('main > section').first()
  await mainContent.evaluate((node, nextPosition) => {
    node.scrollTop = nextPosition === 'top' ? 0 : node.scrollHeight
  }, position)
}

const saveHeartbeatForm = async (window) => {
  const saveButton = window.getByRole('button', { name: 'Save heartbeat' })
  await saveButton.scrollIntoViewIfNeeded()
  await expect(saveButton).toBeVisible()
  await saveButton.click()
}

const confirmHeartbeatDelete = async (window) => {
  await window.evaluate(() => {
    if (typeof window.confirm !== 'function' || window.confirm.__familiarAutoConfirmHeartbeatDelete === true) {
      if (window.__familiarAutoConfirmHeartbeatDeleteState) {
        window.__familiarAutoConfirmHeartbeatDeleteState.invoked = false
        window.__familiarAutoConfirmHeartbeatDeleteState.message = ''
      }
      return
    }

    const originalConfirm = window.confirm
    const autoConfirm = (message) => {
      const nextMessage = String(message || '')
      window.__familiarAutoConfirmHeartbeatDeleteState = {
        invoked: true,
        message: nextMessage
      }

      if (nextMessage === 'Delete this heartbeat?') {
        return true
      }

      return originalConfirm ? originalConfirm(message) : true
    }

    autoConfirm.__familiarAutoConfirmHeartbeatDelete = true
    window.__familiarAutoConfirmHeartbeatDeleteState = { invoked: false, message: '' }
    window.confirm = autoConfirm
  })

  const dialogResult = window.waitForEvent('dialog').then(async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    expect(dialog.message()).toBe('Delete this heartbeat?')
    await dialog.accept()
  })

  const fallbackResult = window.waitForFunction(() => {
    return window.__familiarAutoConfirmHeartbeatDeleteState?.invoked === true
  }).then(async () => {
    const state = await window.evaluate(() => window.__familiarAutoConfirmHeartbeatDeleteState)
    expect(state?.message).toBe('Delete this heartbeat?')
  })

  return Promise.race([dialogResult, fallbackResult])
}

test('heartbeats editing flow updates settings for create, edit, disable, and delete', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-heartbeats-context-e2e-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-heartbeats-settings-e2e-'))
  const settingsPath = path.join(settingsDir, 'settings.json')
  const initialSettings = {
    wizardCompleted: true,
    contextFolderPath: contextPath,
    skillInstaller: {
      harness: ['codex', 'claude'],
      installPath: ['/tmp/.codex/skills/familiar', '/tmp/.claude/skills/familiar']
    },
    heartbeats: { items: [] }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2), 'utf-8')

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
    const createdTime = toTimeInputValue(20)
    const editedTime = toTimeInputValue(40)
    const createdTopic = 'standup summary'
    const storedCreatedTopic = 'standup_summary'
    const invalidRunnerError = 'Only allowed for options picked in "Connect Agent".'
    const editedTopic = 'standup-summary-edited'
    const createdPrompt = 'Summarize the most important work from the last day.'
    const editedPrompt = 'Summarize progress and blockers from the latest work.'

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('tab', { name: 'Connect Agent' }).click()
    await expect(window.locator('#settings-skill-harness-codex')).toBeChecked()
    await expect(window.locator('#settings-skill-harness-claude')).toBeChecked()

    await window.getByRole('tab', { name: 'Heartbeats' }).click()
    await expect(window.locator('#section-title')).toHaveText('Heartbeats')

    await window.locator('#heartbeats-add').click()
    await expect(window.getByRole('dialog', { name: 'New Heartbeat' })).toBeVisible()
    await window.locator('#heartbeat-topic').fill(createdTopic)
    await window.locator('#heartbeat-prompt').fill(createdPrompt)
    await window.locator('#heartbeat-time').fill(createdTime)
    await saveHeartbeatForm(window)
    await expect(window.getByRole('dialog', { name: 'New Heartbeat' })).toHaveCount(0)

    await expect.poll(() => readSettings(settingsPath)?.heartbeats?.items?.length ?? 0).toBe(1)
    await expectStoredHeartbeat(settingsPath, {
      topic: storedCreatedTopic,
      prompt: createdPrompt,
      runner: 'codex',
      frequency: 'daily',
      time: createdTime,
      enabled: true
    })
    await expect(window.getByText('didnt run yet')).toBeVisible()
    await expect(window.getByText(/Last run at 1\/1\/1970|Last run at 01\/01\/1970/)).toHaveCount(0)

    const createdHeartbeat = readStoredHeartbeat(settingsPath)
    expect(createdHeartbeat).not.toBeNull()
    expect(createdHeartbeat.id).toMatch(/^heartbeat-\d+$/)
    expect(typeof createdHeartbeat.createdAt).toBe('number')
    expect(typeof createdHeartbeat.updatedAt).toBe('number')

    await window.locator('#heartbeats-add').click()
    await expect(window.getByRole('dialog', { name: 'New Heartbeat' })).toBeVisible()
    await window.locator('#heartbeat-topic').fill('blocked antigravity heartbeat')
    await window.locator('#heartbeat-prompt').fill('This should be rejected because Antigravity is not enabled.')
    await window.locator('#heartbeat-runner').selectOption('antigravity')
    await saveHeartbeatForm(window)
    await expect(window.getByText(invalidRunnerError).first()).toBeVisible()
    await expect.poll(() => readSettings(settingsPath)?.heartbeats?.items?.length ?? 0).toBe(1)
    await window.getByRole('button', { name: 'Cancel' }).click()
    await expect(window.getByRole('dialog', { name: 'New Heartbeat' })).toHaveCount(0)

    await scrollSettingsContent(window, 'top')
    await window.getByRole('button', { name: 'Edit' }).click()
    await expect(window.getByRole('dialog', { name: 'Edit Heartbeat' })).toBeVisible()
    await window.locator('#heartbeat-topic').fill(editedTopic)
    await window.locator('#heartbeat-prompt').fill(editedPrompt)
    await window.locator('#heartbeat-time').fill(editedTime)
    await saveHeartbeatForm(window)
    await expect(window.getByRole('dialog', { name: 'Edit Heartbeat' })).toHaveCount(0)

    await expectStoredHeartbeat(settingsPath, {
      topic: editedTopic,
      prompt: editedPrompt,
      runner: 'codex',
      frequency: 'daily',
      time: editedTime,
      enabled: true
    })

    const editedHeartbeat = readStoredHeartbeat(settingsPath)
    expect(editedHeartbeat).not.toBeNull()
    expect(editedHeartbeat.id).toBe(createdHeartbeat.id)
    expect(editedHeartbeat.createdAt).toBe(createdHeartbeat.createdAt)
    expect(editedHeartbeat.updatedAt).toBeGreaterThanOrEqual(createdHeartbeat.updatedAt)

    await scrollSettingsContent(window, 'top')
    const enabledCheckbox = window.locator('#section-heartbeats input[type="checkbox"]').first()
    await expect(enabledCheckbox).toBeChecked()
    await enabledCheckbox.click()

    await expectStoredHeartbeat(settingsPath, {
      topic: editedTopic,
      prompt: editedPrompt,
      runner: 'codex',
      frequency: 'daily',
      time: editedTime,
      enabled: false
    })

    await scrollSettingsContent(window, 'top')
    const deleteConfirmation = confirmHeartbeatDelete(window)
    await window.getByRole('button', { name: 'Delete' }).click()
    await deleteConfirmation

    await expect.poll(() => readSettings(settingsPath)?.heartbeats?.items?.length ?? 0).toBe(0)
  } finally {
    await electronApp.close()
  }
})
