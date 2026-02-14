(function (global) {
  const createStills = (options = {}) => {
    const elements = options.elements || {}
    const familiar = options.familiar || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})
    const recordingStatusIndicator = global.FamiliarRecordingStatusIndicator
      || (typeof require === 'function' ? require('../recording-status-indicator') : null)
    const getRecordingIndicatorVisuals = (
      recordingStatusIndicator && typeof recordingStatusIndicator.getRecordingIndicatorVisuals === 'function'
    )
      ? recordingStatusIndicator.getRecordingIndicatorVisuals
      : () => ({ status: 'off', label: 'Off', dotClass: 'bg-zinc-400' })

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
      permissionCheckButtons = [],
      openScreenRecordingSettingsButtons = [],
      permissionRecordingToggleSections = [],
      wizardCheckPermissionsButton,
      wizardOpenScreenRecordingSettingsButton,
      wizardRecordingToggleSection
    } = elements

    const toArray = (value) => {
      if (Array.isArray(value)) {
        return value.filter(Boolean)
      }
      return value ? [value] : []
    }

    const allPermissionCheckButtons = [
      ...toArray(permissionCheckButtons),
      ...toArray(wizardCheckPermissionsButton)
    ]
    const allOpenScreenRecordingSettingsButtons = [
      ...toArray(openScreenRecordingSettingsButtons),
      ...toArray(wizardOpenScreenRecordingSettingsButton)
    ]
    const allPermissionRecordingToggleSections = [
      ...toArray(permissionRecordingToggleSections),
      ...toArray(wizardRecordingToggleSection)
    ]

    let currentScreenStillsState = 'disabled'
    let currentScreenStillsPaused = false
    let currentScreenStillsPermissionGranted = true
    let currentScreenStillsPermissionStatus = 'granted'
    let statusPoller = null
    let wizardPermissionState = 'idle'
    let isCheckingPermission = false

    const isCaptureActive = () =>
      currentScreenStillsState === 'recording' || currentScreenStillsState === 'idleGrace'

    const buildStillsPath = (contextFolderPath) =>
      contextFolderPath ? `${contextFolderPath}/familiar/stills` : ''

    const updateSidebarStatus = (alwaysEnabled) => {
      if (!sidebarRecordingStatus && !sidebarRecordingDot) {
        return
      }

      const indicator = getRecordingIndicatorVisuals({
        enabled: alwaysEnabled,
        state: currentScreenStillsState,
        manualPaused: currentScreenStillsPaused,
        permissionGranted: currentScreenStillsPermissionGranted,
        permissionStatus: currentScreenStillsPermissionStatus
      })
      const label = indicator.label
      const dotClass = indicator.dotClass
      const togglePausedClass = '!bg-amber-500'

      if (sidebarRecordingStatus) {
        sidebarRecordingStatus.textContent = label
      }
      if (sidebarRecordingDot) {
        sidebarRecordingDot.classList.remove(
          'bg-zinc-400',
          'bg-emerald-500',
          'bg-amber-500',
          'bg-red-500'
        )
        sidebarRecordingDot.classList.add(dotClass)
      }
      if (sidebarRecordingToggleTrack) {
        sidebarRecordingToggleTrack.classList.remove(togglePausedClass)
        if (alwaysEnabled && currentScreenStillsPaused) {
          sidebarRecordingToggleTrack.classList.add(togglePausedClass)
        }
      }
    }

    const updatePermissionControls = () => {
      const showToggle = wizardPermissionState === 'granted'
      const showOpenSettingsButton = wizardPermissionState === 'denied'

      for (const section of allPermissionRecordingToggleSections) {
        section.classList.toggle('hidden', !showToggle)
      }

      for (const button of allPermissionCheckButtons) {
        button.disabled = isCheckingPermission
        button.classList.remove(
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
          button.textContent = 'Checking...'
        } else {
          if (wizardPermissionState === 'granted') {
            button.classList.add(
              'bg-emerald-600',
              'hover:bg-emerald-700',
              'border-emerald-600',
              'hover:border-emerald-700'
            )
            button.textContent = 'Granted'
          } else if (wizardPermissionState === 'denied') {
            button.classList.add(
              'bg-red-600',
              'hover:bg-red-700',
              'border-red-600',
              'hover:border-red-700'
            )
            button.textContent = 'Check Permissions'
          } else {
            button.classList.add(
              'bg-indigo-600',
              'hover:bg-indigo-700',
              'border-indigo-600',
              'hover:border-indigo-700'
            )
            button.textContent = 'Check Permissions'
          }
        }
      }

      for (const button of allOpenScreenRecordingSettingsButtons) {
        button.classList.toggle('hidden', !showOpenSettingsButton)
      }
    }

    const refreshStatus = async () => {
      if (!familiar.getScreenStillsStatus) {
        return
      }
      try {
        const result = await familiar.getScreenStillsStatus()
        if (result && result.ok) {
          currentScreenStillsState = result.state || 'disabled'
          currentScreenStillsPaused = Boolean(result.manualPaused)
          currentScreenStillsPermissionStatus = typeof result.permissionStatus === 'string'
            ? result.permissionStatus
            : currentScreenStillsPermissionStatus
          currentScreenStillsPermissionGranted = typeof result.permissionGranted === 'boolean'
            ? result.permissionGranted
            : currentScreenStillsPermissionStatus === 'granted'
        } else {
          currentScreenStillsState = 'disabled'
          currentScreenStillsPaused = false
          currentScreenStillsPermissionStatus = 'granted'
          currentScreenStillsPermissionGranted = true
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
        permissionElement.classList.add('hidden')
      }

      updatePermissionControls()
    }

    const handleCheckPermissions = async () => {
      if (!familiar.checkScreenRecordingPermission || isCheckingPermission) {
        return
      }
      isCheckingPermission = true
      updateStillsUI()
      try {
        const result = await familiar.checkScreenRecordingPermission()
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
      if (!familiar.openScreenRecordingSettings) {
        return
      }
      try {
        const result = await familiar.openScreenRecordingSettings()
        if (!result || result.ok !== true) {
          console.error('Failed to open Screen Recording settings', result?.message || result)
        }
      } catch (error) {
        console.error('Failed to open Screen Recording settings', error)
      }
    }

    const handleWizardStepChange = (step) => {
      if (Number(step) !== 2) {
        return
      }
      void handleCheckPermissions()
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
      if (!familiar.startScreenStills || !familiar.pauseScreenStills) {
        return
      }
      try {
        if (currentScreenStillsPaused) {
          await familiar.startScreenStills()
        } else if (isCaptureActive()) {
          await familiar.pauseScreenStills()
        } else {
          await familiar.startScreenStills()
        }
      } catch (error) {
        console.error('Failed to toggle stills', error)
      } finally {
        await refreshStatus()
        updateStillsUI()
      }
    }

    const handleOpenFolder = async () => {
      if (!familiar.openStillsFolder) {
        return
      }
      try {
        const result = await familiar.openStillsFolder()
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

    for (const button of allPermissionCheckButtons) {
      button.addEventListener('click', () => {
        void handleCheckPermissions()
      })
    }

    for (const button of allOpenScreenRecordingSettingsButtons) {
      button.addEventListener('click', () => {
        void handleOpenScreenRecordingSettings()
      })
    }

    return {
      handleSectionChange,
      handleWizardStepChange,
      updateStillsUI,
      updateRecordingUI: updateStillsUI
    }
  }

  const registry = global.FamiliarStills || {}
  registry.createStills = createStills
  global.FamiliarStills = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(typeof window !== 'undefined' ? window : global)
