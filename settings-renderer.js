document.addEventListener('DOMContentLoaded', () => {
  const jiminy = window.jiminy || {}
  const contextFolderInput = document.getElementById('context-folder-path')
  const chooseButton = document.getElementById('context-folder-choose')
  const saveButton = document.getElementById('context-folder-save')
  const errorMessage = document.getElementById('context-folder-error')
  const statusMessage = document.getElementById('context-folder-status')

  const setMessage = (element, message) => {
    if (!element) {
      return
    }

    element.textContent = message || ''
    element.style.display = message ? 'block' : 'none'
  }

  const updateSaveState = () => {
    if (!saveButton || !contextFolderInput) {
      return
    }
    saveButton.disabled = !contextFolderInput.value
  }

  const loadSettings = async () => {
    if (!jiminy.getSettings || !contextFolderInput) {
      return
    }

    try {
      const result = await jiminy.getSettings()
      contextFolderInput.value = result.contextFolderPath || ''
      setMessage(errorMessage, result.validationMessage || '')
      setMessage(statusMessage, '')
      updateSaveState()
    } catch (error) {
      console.error('Failed to load settings', error)
      setMessage(errorMessage, 'Failed to load settings.')
    }
  }

  if (!jiminy.pickContextFolder || !jiminy.saveSettings || !jiminy.getSettings) {
    setMessage(errorMessage, 'Settings bridge unavailable. Restart the app.')
    updateSaveState()
    return
  }

  if (chooseButton) {
    chooseButton.addEventListener('click', async () => {
      try {
        setMessage(statusMessage, 'Opening folder picker...')
        const result = await jiminy.pickContextFolder()
        if (result && !result.canceled && result.path && contextFolderInput) {
          contextFolderInput.value = result.path
          setMessage(errorMessage, '')
          setMessage(statusMessage, '')
          updateSaveState()
        } else if (result && result.error) {
          setMessage(statusMessage, '')
          setMessage(errorMessage, result.error)
        } else {
          setMessage(statusMessage, '')
        }
      } catch (error) {
        console.error('Failed to pick context folder', error)
        setMessage(statusMessage, '')
        setMessage(errorMessage, 'Failed to open folder picker.')
      }
    })
  }

  if (saveButton) {
    saveButton.addEventListener('click', async () => {
      if (!contextFolderInput) {
        return
      }

      setMessage(statusMessage, 'Saving...')
      setMessage(errorMessage, '')

      try {
        const result = await jiminy.saveSettings(contextFolderInput.value)
        if (result && result.ok) {
          setMessage(statusMessage, 'Saved.')
        } else {
          setMessage(statusMessage, '')
          setMessage(errorMessage, result?.message || 'Failed to save settings.')
        }
      } catch (error) {
        console.error('Failed to save settings', error)
        setMessage(statusMessage, '')
        setMessage(errorMessage, 'Failed to save settings.')
      }
    })
  }

  void loadSettings()
})
