(function (global) {
  const createStills = (options = {}) => {
    const elements = options.elements || {}
    const jiminy = options.jiminy || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})

    const {
      sidebarRecordingDot,
      sidebarRecordingStatus,
      recordingDetails,
      recordingPath,
      recordingOpenFolderButton,
      recordingStatus,
      recordingActionButton,
      recordingPermission
    } = elements

    let currentScreenStillsState = 'disabled'
    let currentScreenStillsPaused = false
    let currentScreenRecordingPermissionStatus = ''
    let statusPoller = null

    const isCaptureActive = () =>
      currentScreenStillsState === 'recording' || currentScreenStillsState === 'idleGrace'

    const buildStillsPath = (contextFolderPath) =>
      contextFolderPath ? `${contextFolderPath}/jiminy/stills` : ''

    const updateSidebarStatus = (alwaysEnabled) => {
      if (!sidebarRecordingStatus && !sidebarRecordingDot) {
        return
      }

      let label = 'Off'
      let dotClass = 'bg-zinc-400'

      if (alwaysEnabled) {
        if (currentScreenStillsPaused) {
          label = 'Paused'
          dotClass = 'bg-zinc-400'
        } else if (isCaptureActive()) {
          label = 'Recording'
          dotClass = 'bg-emerald-500'
        } else {
          label = 'Idle'
          dotClass = 'bg-zinc-400'
        }
      }

      if (sidebarRecordingStatus) {
        sidebarRecordingStatus.textContent = label
      }
      if (sidebarRecordingDot) {
        sidebarRecordingDot.classList.remove('bg-zinc-400', 'bg-emerald-500')
        sidebarRecordingDot.classList.add(dotClass)
      }
    }

    const setText = (element, value) => {
      if (!element) {
        return
      }
      const nextValue = value || ''
      if (element.textContent !== nextValue) {
        element.textContent = nextValue
      }
    }

    const refreshStatus = async () => {
      if (!jiminy.getScreenStillsStatus) {
        return
      }
      try {
        const result = await jiminy.getScreenStillsStatus()
        if (result && result.ok) {
          currentScreenStillsState = result.state || 'disabled'
          currentScreenStillsPaused = Boolean(result.manualPaused)
        } else {
          currentScreenStillsState = 'disabled'
          currentScreenStillsPaused = false
        }
      } catch (error) {
        console.error('Failed to load stills status', error)
      }
    }

    const updateStillsUI = () => {
      const state = getState()
      const currentContextFolderPath = state.currentContextFolderPath || ''
      const currentAlwaysRecordWhenActive = Boolean(state.currentAlwaysRecordWhenActive)
      const stillsPath = buildStillsPath(currentContextFolderPath)

      updateSidebarStatus(currentAlwaysRecordWhenActive)

      if (recordingDetails) {
        recordingDetails.classList.toggle('hidden', !currentAlwaysRecordWhenActive)
      }

      if (recordingPath) {
        if (stillsPath) {
          recordingPath.textContent = stillsPath
        } else {
          recordingPath.textContent = 'Set a context folder to enable stills.'
        }
      }

      if (recordingOpenFolderButton) {
        const canOpenFolder = Boolean(stillsPath)
        recordingOpenFolderButton.disabled = !canOpenFolder
        recordingOpenFolderButton.classList.toggle('hidden', !canOpenFolder)
      }

      if (recordingStatus) {
        if (currentScreenStillsPaused) {
          recordingStatus.textContent = 'Paused'
        } else {
          recordingStatus.textContent = isCaptureActive() ? 'Capturing' : 'Not capturing'
        }
      }

      if (recordingActionButton) {
        const isActive = isCaptureActive()
        let label = 'Start capture'
        if (currentScreenStillsPaused) {
          label = 'Resume'
        } else if (isActive) {
          label = 'Pause (10 min)'
        }
        recordingActionButton.textContent = label
        recordingActionButton.disabled = !currentAlwaysRecordWhenActive || !currentContextFolderPath
      }

      if (recordingPermission) {
        const permissionStatus = currentScreenRecordingPermissionStatus || ''
        const needsPermission = permissionStatus && permissionStatus !== 'granted'
        if (needsPermission) {
          recordingPermission.textContent =
            'Screen Recording permission required. Enable Jiminy in System Settings \u2192 Privacy & Security \u2192 Screen Recording.'
        } else {
          recordingPermission.textContent = ''
        }
        recordingPermission.classList.toggle('hidden', !recordingPermission.textContent)
      }
    }

    const updatePermission = (permissionStatus) => {
      currentScreenRecordingPermissionStatus = permissionStatus || ''
    }

    const startStatusPoller = () => {
      if (statusPoller) {
        return
      }
      statusPoller = setInterval(async () => {
        await refreshStatus()
        updateStillsUI()
      }, 2000)
      if (typeof statusPoller.unref === 'function') {
        statusPoller.unref()
      }
    }

    const stopStatusPoller = () => {
      if (!statusPoller) {
        return
      }
      clearInterval(statusPoller)
      statusPoller = null
    }

    const handleAction = async () => {
      if (!jiminy.startScreenStills || !jiminy.pauseScreenStills) {
        return
      }
      try {
        if (currentScreenStillsPaused) {
          await jiminy.startScreenStills()
        } else if (isCaptureActive()) {
          await jiminy.pauseScreenStills()
        } else {
          await jiminy.startScreenStills()
        }
      } catch (error) {
        console.error('Failed to toggle stills', error)
      } finally {
        await refreshStatus()
        updateStillsUI()
      }
    }

    const handleOpenFolder = async () => {
      if (!jiminy.openStillsFolder) {
        return
      }
      try {
        const result = await jiminy.openStillsFolder()
        if (!result || result.ok !== true) {
          console.error('Failed to open stills folder', result?.message || result)
        }
      } catch (error) {
        console.error('Failed to open stills folder', error)
      }
    }

    function handleSectionChange(nextSection) {
      // Sidebar status is always visible, so keep it fresh in any section.
      void refreshStatus().then(updateStillsUI)
      startStatusPoller()
    }

    if (recordingActionButton) {
      recordingActionButton.addEventListener('click', () => {
        void handleAction()
      })
    }

    if (recordingOpenFolderButton) {
      recordingOpenFolderButton.addEventListener('click', () => {
        void handleOpenFolder()
      })
    }

    return {
      handleSectionChange,
      setPermissionStatus: updatePermission,
      updateStillsUI,
      updateRecordingUI: updateStillsUI
    }
  }

  const registry = global.JiminyStills || {}
  registry.createStills = createStills
  global.JiminyStills = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(typeof window !== 'undefined' ? window : global)
