(function (global) {
  const createStills = (options = {}) => {
    const elements = options.elements || {}
    const jiminy = options.jiminy || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})

    const {
      sidebarRecordingDot,
      sidebarRecordingStatus,
      sidebarRecordingToggleTrack,
      sidebarRecordingActionButton,
      sidebarRecordingPermission,
      recordingDetails,
      recordingPath,
      recordingOpenFolderButton,
      recordingStatus,
      recordingActionButton,
      recordingPermission,
      wizardCheckPermissionsButton,
      wizardOpenScreenRecordingSettingsButton,
      wizardRecordingToggleSection
    } = elements

    let currentScreenStillsState = 'disabled'
    let currentScreenStillsPaused = false
    let statusPoller = null
    let wizardPermissionState = 'idle'
    let isCheckingPermission = false

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
      const togglePausedClass = '!bg-amber-500'

      if (alwaysEnabled) {
        if (currentScreenStillsPaused) {
          label = 'Paused'
          dotClass = 'bg-amber-500'
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
        sidebarRecordingDot.classList.remove('bg-zinc-400', 'bg-emerald-500', 'bg-amber-500')
        sidebarRecordingDot.classList.add(dotClass)
      }
      if (sidebarRecordingToggleTrack) {
        sidebarRecordingToggleTrack.classList.remove(togglePausedClass)
        if (alwaysEnabled && currentScreenStillsPaused) {
          sidebarRecordingToggleTrack.classList.add(togglePausedClass)
        }
      }
    }

    const updateWizardPermissionControls = (alwaysEnabled) => {
      if (alwaysEnabled) {
        wizardPermissionState = 'granted'
      }

      if (wizardRecordingToggleSection) {
        const showToggle = alwaysEnabled || wizardPermissionState === 'granted'
        wizardRecordingToggleSection.classList.toggle('hidden', !showToggle)
      }

      if (wizardCheckPermissionsButton) {
        wizardCheckPermissionsButton.disabled = isCheckingPermission
        wizardCheckPermissionsButton.classList.remove(
          'bg-indigo-600',
          'hover:bg-indigo-700',
          'border-indigo-600',
          'hover:border-indigo-700',
          'bg-red-600',
          'hover:bg-red-700',
          'border-red-600',
          'hover:border-red-700',
          'bg-emerald-600',
          'hover:bg-emerald-700',
          'border-emerald-600',
          'hover:border-emerald-700'
        )
        if (isCheckingPermission) {
          wizardCheckPermissionsButton.textContent = 'Checking...'
        } else {
          if (wizardPermissionState === 'granted') {
            wizardCheckPermissionsButton.classList.add(
              'bg-emerald-600',
              'hover:bg-emerald-700',
              'border-emerald-600',
              'hover:border-emerald-700'
            )
            wizardCheckPermissionsButton.textContent = 'Granted'
          } else if (wizardPermissionState === 'denied') {
            wizardCheckPermissionsButton.classList.add(
              'bg-red-600',
              'hover:bg-red-700',
              'border-red-600',
              'hover:border-red-700'
            )
            wizardCheckPermissionsButton.textContent = 'Check Permissions'
          } else {
            wizardCheckPermissionsButton.classList.add(
              'bg-indigo-600',
              'hover:bg-indigo-700',
              'border-indigo-600',
              'hover:border-indigo-700'
            )
            wizardCheckPermissionsButton.textContent = 'Check Permissions'
          }
        }
      }

      if (wizardOpenScreenRecordingSettingsButton) {
        const showOpenSettingsButton = wizardPermissionState === 'denied' && !alwaysEnabled
        wizardOpenScreenRecordingSettingsButton.classList.toggle('hidden', !showOpenSettingsButton)
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

      if (sidebarRecordingActionButton) {
        const isActive = isCaptureActive()
        let label = 'Start capture'
        if (currentScreenStillsPaused) {
          label = 'Resume'
        } else if (isActive) {
          label = 'Pause (10 min)'
        }
        sidebarRecordingActionButton.textContent = label
        sidebarRecordingActionButton.disabled = !currentAlwaysRecordWhenActive || !currentContextFolderPath
      }

      const permissionElement = sidebarRecordingPermission || recordingPermission
      if (permissionElement) {
        permissionElement.textContent = ''
        permissionElement.classList.toggle('hidden', !permissionElement.textContent)
      }

      updateWizardPermissionControls(currentAlwaysRecordWhenActive)
    }

    const handleCheckPermissions = async () => {
      if (!jiminy.checkScreenRecordingPermission || isCheckingPermission) {
        return
      }
      isCheckingPermission = true
      updateStillsUI()
      try {
        const result = await jiminy.checkScreenRecordingPermission()
        wizardPermissionState = result?.permissionStatus === 'granted' ? 'granted' : 'denied'
      } catch (error) {
        console.error('Failed to check Screen Recording permission', error)
        wizardPermissionState = 'denied'
      } finally {
        isCheckingPermission = false
        updateStillsUI()
      }
    }

    const handleOpenScreenRecordingSettings = async () => {
      if (!jiminy.openScreenRecordingSettings) {
        return
      }
      try {
        const result = await jiminy.openScreenRecordingSettings()
        if (!result || result.ok !== true) {
          console.error('Failed to open Screen Recording settings', result?.message || result)
        }
      } catch (error) {
        console.error('Failed to open Screen Recording settings', error)
      }
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

    if (sidebarRecordingActionButton) {
      sidebarRecordingActionButton.addEventListener('click', () => {
        void handleAction()
      })
    }

    if (recordingOpenFolderButton) {
      recordingOpenFolderButton.addEventListener('click', () => {
        void handleOpenFolder()
      })
    }

    if (wizardCheckPermissionsButton) {
      wizardCheckPermissionsButton.addEventListener('click', () => {
        void handleCheckPermissions()
      })
    }

    if (wizardOpenScreenRecordingSettingsButton) {
      wizardOpenScreenRecordingSettingsButton.addEventListener('click', () => {
        void handleOpenScreenRecordingSettings()
      })
    }

    return {
      handleSectionChange,
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
