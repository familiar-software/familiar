const assert = require('node:assert')

const getSettingsWindow = async (electronApp) => {
  let requestedActivation = false

  for (let attempt = 0; attempt < 50; attempt += 1) {
    for (const window of electronApp.windows()) {
      try {
        const hasSettingsBridge = await window.evaluate(
          () => typeof window.familiar?.getSettings === 'function'
        )
        if (hasSettingsBridge) {
          return window
        }
      } catch {
        // The window may still be loading or use a different preload bridge.
      }
    }

    if (!requestedActivation) {
      requestedActivation = true
      try {
        await electronApp.evaluate(({ app }) => {
          app.emit('activate')
        })
      } catch (error) {
        const isDestroyedContext = error instanceof Error &&
          error.message.includes('Execution context was destroyed')
        if (!isDestroyedContext) {
          throw error
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('Timed out waiting for the settings window')
}

const confirmMoveContextFolder = async (window) => {
  const confirmState = {
    message: '',
    invoked: false
  }

  await window.evaluate((state) => {
    const isAutoConfirmInstalled =
      window.confirm?.__familiarAutoConfirmContextFolder === true
    if (typeof window.confirm !== 'function' || isAutoConfirmInstalled) {
      if (window.__familiarAutoConfirmContextFolderState) {
        window.__familiarAutoConfirmContextFolderState.invoked = false
        window.__familiarAutoConfirmContextFolderState.message = ''
      }
      return
    }

    const autoConfirm = (message) => {
      const nextMessage = String(message || '')
      const normalizedState = window.__familiarAutoConfirmContextFolderState
      if (normalizedState) {
        normalizedState.invoked = true
        normalizedState.message = nextMessage
      }
      if (/context folder/i.test(nextMessage)) {
        return true
      }
      const originalConfirm = window.__familiarAutoConfirmOriginalConfirm
      return originalConfirm ? originalConfirm(message) : true
    }

    window.__familiarAutoConfirmContextFolderState = { ...state, invoked: false, message: '' }
    window.__familiarAutoConfirmOriginalConfirm = window.confirm
    autoConfirm.__familiarAutoConfirmContextFolder = true
    window.confirm = autoConfirm
  }, confirmState)

  const dialogResult = window.waitForEvent('dialog').then(async (dialog) => {
    assert.equal(dialog.type(), 'confirm', 'Expected a confirm dialog when moving context folder')
    const message = String(dialog.message() || '')
    assert.match(
      message.toLowerCase(),
      /context folder/,
      'Expected context folder move confirmation message'
    )
    await dialog.accept()
    return { type: 'page-dialog', message }
  })

  const fallbackResult = window
    .waitForFunction(() => {
      return window.__familiarAutoConfirmContextFolderState?.invoked === true
    })
    .then(async () => {
      const state = await window.evaluate(() => {
        const {
          invoked = false,
          message = ''
        } = window.__familiarAutoConfirmContextFolderState || {}
        return {
          invoked,
          message: String(message || '')
        }
      })

      assert.ok(
        state.invoked,
        'Expected window.confirm to be invoked when moving context folder'
      )
      assert.match(
        state.message.toLowerCase(),
        /context folder/,
        'Expected context folder move confirmation message'
      )

      return {
        type: 'window-confirm',
        message: state.message
      }
    })

  return Promise.race([dialogResult, fallbackResult])
}

module.exports = {
  confirmMoveContextFolder,
  getSettingsWindow
}
