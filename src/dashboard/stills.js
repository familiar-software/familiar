(function (global) {
  const microcopyModule = global?.FamiliarMicrocopy || (typeof require === 'function' ? require('../microcopy') : null)
  if (!microcopyModule || !microcopyModule.microcopy) {
    throw new Error('Familiar microcopy is unavailable')
  }
  const { microcopy } = microcopyModule

  const createStills = (options = {}) => {
    const elements = options.elements || {}
    const familiar = options.familiar || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})
    const setAlwaysRecordWhenActiveValue = typeof options.setAlwaysRecordWhenActiveValue === 'function'
      ? options.setAlwaysRecordWhenActiveValue
      : () => {}
    const recordingStatusIndicator = global.FamiliarRecordingStatusIndicator
      || (typeof require === 'function' ? require('../recording-status-indicator') : null)
    const getRecordingIndicatorVisuals = (
      recordingStatusIndicator && typeof recordingStatusIndicator.getRecordingIndicatorVisuals === 'function'
    )
      ? recordingStatusIndicator.getRecordingIndicatorVisuals
      : () => ({
          status: 'off',
          label: microcopy.recordingIndicator.off,
          dotClass: 'bg-zinc-400'
        })

    const {
      recordingStatusDot,
      recordingStatus,
      recordingDetails,
      recordingPath,
      recordingOpenFolderButton,
      recordingPermission,
      permissionCheckButtons = [],
      openScreenRecordingSettingsButtons = [],
      permissionRecordingToggleSections = [],
      openScreenRecordingSettingsNotes = []
    } = elements

    const toArray = (value) => {
      if (Array.isArray(value)) {
        return value.filter(Boolean)
      }
      return value ? [value] : []
    }

    const allPermissionCheckButtons = [
      ...toArray(permissionCheckButtons)
    ]
    const allOpenScreenRecordingSettingsButtons = [
      ...toArray(openScreenRecordingSettingsButtons)
    ]
    const allOpenScreenRecordingSettingsNotes = [
      ...toArray(openScreenRecordingSettingsNotes)
    ]
    const allPermissionRecordingToggleSections = [
      ...toArray(permissionRecordingToggleSections)
    ]

    let currentScreenStillsState = 'disabled'
    let currentScreenStillsPaused = false
    let currentScreenStillsEnabled = false
    let currentScreenStillsPermissionGranted = true
    let currentScreenStillsPermissionStatus = 'granted'
    let statusPoller = null
    let wizardPermissionState = 'idle'
    let isCheckingPermission = false

    const buildStillsPath = (contextFolderPath) =>
      contextFolderPath ? `${contextFolderPath}/familiar/stills` : ''

    const updateStatusIndicator = (alwaysEnabled) => {
      if (!recordingStatus && !recordingStatusDot) {
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

      if (recordingStatus) {
        recordingStatus.textContent = label
      }
      if (recordingStatusDot) {
        recordingStatusDot.classList.remove(
          'bg-zinc-400',
          'bg-emerald-500',
          'bg-amber-500',
          'bg-red-500'
        )
        recordingStatusDot.classList.add(dotClass)
      }
    }

    const updatePermissionControls = () => {
      const shouldShowToggleForSection = (section) => {
        if (section?.dataset?.permissionToggleVisibility === 'always') {
          return true
        }
        return wizardPermissionState === 'granted'
      }
      const showOpenSettingsButton = wizardPermissionState === 'denied'

      for (const section of allPermissionRecordingToggleSections) {
        section.classList.toggle('hidden', !shouldShowToggleForSection(section))
      }

      for (const button of allPermissionCheckButtons) {
        button.disabled = isCheckingPermission
        button.classList.remove(
          'bg-indigo-600',
          'hover:bg-indigo-700',
          'text-indigo-600',
          'hover:text-indigo-700',
          'border-indigo-600',
          'hover:border-indigo-700',
          'bg-emerald-600',
          'hover:bg-emerald-700',
          'text-emerald-600',
          'hover:text-emerald-700',
          'border-emerald-600',
          'hover:border-emerald-700'
        )
        if (isCheckingPermission) {
          button.textContent = microcopy.dashboard.stills.checkingPermissions
        } else {
          if (wizardPermissionState === 'granted') {
            button.classList.add(
              'text-emerald-600',
              'hover:text-emerald-700',
              'border-emerald-600',
              'hover:border-emerald-700'
            )
            button.textContent = microcopy.dashboard.stills.permissionsGranted
          } else {
            button.classList.add(
              'text-indigo-600',
              'hover:text-indigo-700',
              'border-indigo-600',
              'hover:border-indigo-700'
            )
            button.textContent = microcopy.dashboard.stills.checkPermissions
          }
        }
      }

      for (const button of allOpenScreenRecordingSettingsButtons) {
        button.classList.toggle('hidden', !showOpenSettingsButton)
      }

      for (const note of allOpenScreenRecordingSettingsNotes) {
        note.classList.toggle('hidden', !showOpenSettingsButton)
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
          if (typeof result.enabled === 'boolean') {
            currentScreenStillsEnabled = result.enabled
            setAlwaysRecordWhenActiveValue(currentScreenStillsEnabled)
          }
          currentScreenStillsPermissionStatus = typeof result.permissionStatus === 'string'
            ? result.permissionStatus
            : currentScreenStillsPermissionStatus
          currentScreenStillsPermissionGranted = typeof result.permissionGranted === 'boolean'
            ? result.permissionGranted
            : currentScreenStillsPermissionStatus === 'granted'
        } else {
          currentScreenStillsState = 'disabled'
          currentScreenStillsPaused = false
          currentScreenStillsEnabled = false
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

      updateStatusIndicator(currentAlwaysRecordWhenActive)

      if (recordingDetails) {
        recordingDetails.classList.toggle('hidden', !currentAlwaysRecordWhenActive)
      }

      if (recordingPath) {
        if (stillsPath) {
          recordingPath.textContent = stillsPath
        } else {
          recordingPath.textContent = microcopy.dashboard.stills.setContextFolderToEnableStills
        }
      }

      if (recordingOpenFolderButton) {
        const canOpenFolder = Boolean(stillsPath)
        recordingOpenFolderButton.disabled = !canOpenFolder
        recordingOpenFolderButton.classList.toggle('hidden', !canOpenFolder)
      }

      if (recordingPermission) {
        recordingPermission.textContent = ''
        recordingPermission.classList.add('hidden')
      }

      updatePermissionControls()
    }

    const handleCheckPermissions = async () => {
      if ((!familiar.requestScreenRecordingPermission && !familiar.checkScreenRecordingPermission) || isCheckingPermission) {
        return
      }
      isCheckingPermission = true
      updateStillsUI()
      try {
        let result = null
        if (familiar.requestScreenRecordingPermission) {
          result = await familiar.requestScreenRecordingPermission()
        } else {
          result = await familiar.checkScreenRecordingPermission()
        }
        if (result?.permissionStatus) {
          wizardPermissionState = result.permissionStatus === 'granted' ? 'granted' : 'denied'
          return
        }
        const checkResult = await familiar.checkScreenRecordingPermission()
        wizardPermissionState = checkResult?.permissionStatus === 'granted' ? 'granted' : 'denied'
      } catch (error) {
        console.error('Failed to request Screen Recording permission', error)
        wizardPermissionState = 'denied'
      } finally {
        isCheckingPermission = false
        await refreshStatus()
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
      // Keep the recording status indicator fresh when sections change.
      void refreshStatus().then(updateStillsUI)
      startStatusPoller()
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
