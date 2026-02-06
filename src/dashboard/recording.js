(function (global) {
  const createRecording = (options = {}) => {
    const elements = options.elements || {}
    const jiminy = options.jiminy || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})

    const {
      recordingDetails,
      recordingPath,
      recordingOpenFolderButton,
      recordingStatus,
      recordingActionButton,
      recordingPermission,
      recordingQueryQuestion,
      recordingQueryFrom,
      recordingQueryTo,
      recordingQuerySubmit,
      recordingQuerySpinner,
      recordingQueryStatus,
      recordingQueryError,
      recordingQueryAnswer,
      recordingQueryAvailability,
      recordingQueryEstimate,
      recordingQueryPath
    } = elements

    let currentScreenRecordingState = 'disabled'
    let currentScreenRecordingPaused = false
    let currentScreenRecordingPermissionStatus = ''
    let recordingStatusPoller = null
    let recordingQueryAvailabilityState = { available: false, reason: '' }
    let recordingQueryAvailabilityKey = null
    let recordingQueryRunning = false
    let recordingQueryEstimateTimer = null
    let recordingQueryEstimateKey = null

    const isRecordingActive = () =>
      currentScreenRecordingState === 'recording' || currentScreenRecordingState === 'idleGrace'

    const buildRecordingsPath = (contextFolderPath) =>
      contextFolderPath ? `${contextFolderPath}/jiminy/recordings` : ''

    const updateRecordingUI = () => {
      const state = getState()
      const currentContextFolderPath = state.currentContextFolderPath || ''
      const currentAlwaysRecordWhenActive = Boolean(state.currentAlwaysRecordWhenActive)
      const providerKey = `${state.currentLlmProviderName || ''}:${state.currentLlmApiKey || ''}`
      const recordingsPath = buildRecordingsPath(currentContextFolderPath)

      if (recordingDetails) {
        recordingDetails.classList.toggle('hidden', !currentAlwaysRecordWhenActive)
      }

      if (recordingPath) {
        if (recordingsPath) {
          recordingPath.textContent = recordingsPath
        } else {
          recordingPath.textContent = 'Set a context folder to enable recordings.'
        }
      }

      if (recordingOpenFolderButton) {
        const canOpenFolder = Boolean(recordingsPath)
        recordingOpenFolderButton.disabled = !canOpenFolder
        recordingOpenFolderButton.classList.toggle('hidden', !canOpenFolder)
      }

      if (recordingStatus) {
        if (currentScreenRecordingPaused) {
          recordingStatus.textContent = 'Paused'
        } else {
          recordingStatus.textContent = isRecordingActive() ? 'Recording' : 'Not recording'
        }
      }

      if (recordingActionButton) {
        const isRecording = isRecordingActive()
        let label = 'Start recording'
        if (currentScreenRecordingPaused) {
          label = 'Resume'
        } else if (isRecording) {
          label = '10 Minute Pause'
        }
        recordingActionButton.textContent = label
        recordingActionButton.disabled = !currentAlwaysRecordWhenActive || !currentContextFolderPath
      }

      if (recordingPermission) {
        const permissionStatus = currentScreenRecordingPermissionStatus || ''
        const needsPermission = permissionStatus && permissionStatus !== 'granted'
        if (needsPermission) {
          recordingPermission.textContent =
            'Screen Recording permission required. Open System Settings → Privacy & Security → Screen Recording.'
        } else {
          recordingPermission.textContent = ''
        }
        recordingPermission.classList.toggle('hidden', !recordingPermission.textContent)
      }

      if (providerKey !== recordingQueryAvailabilityKey) {
        recordingQueryAvailabilityKey = providerKey
        void refreshRecordingQueryAvailability()
      }

      updateRecordingQueryUI()
    }

    const getTodayDateString = () => {
      const now = new Date()
      const year = String(now.getFullYear())
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
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

    const setHidden = (element, hidden) => {
      if (!element) {
        return
      }
      element.classList.toggle('hidden', Boolean(hidden))
    }

    const setRecordingQueryError = (message) => {
      setText(recordingQueryError, message)
      setHidden(recordingQueryError, !message)
    }

    const setRecordingQueryStatus = (message) => {
      setText(recordingQueryStatus, message)
    }

    const setRecordingQueryAnswer = (message) => {
      if (!recordingQueryAnswer) {
        return
      }
      const nextValue = message || ''
      recordingQueryAnswer.textContent = nextValue
      setHidden(recordingQueryAnswer, !nextValue)
    }

    const setRecordingQueryPath = (pathValue) => {
      const message = pathValue ? `Saved to ${pathValue}` : ''
      setText(recordingQueryPath, message)
      setHidden(recordingQueryPath, !message)
    }

    const setRecordingQueryEstimate = (message) => {
      setText(recordingQueryEstimate, message)
      setHidden(recordingQueryEstimate, !message)
    }

    const formatDurationMs = (durationMs) => {
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return '0m'
      }
      const totalSeconds = Math.round(durationMs / 1000)
      const totalMinutes = Math.floor(totalSeconds / 60)
      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60

      if (hours > 0) {
        return `${hours}h ${minutes}m`
      }
      if (minutes > 0) {
        return `${minutes}m`
      }
      return `${totalSeconds}s`
    }

    const getRecordingQueryRange = () => {
      const fromDate = recordingQueryFrom ? recordingQueryFrom.value : ''
      const toDate = recordingQueryTo ? recordingQueryTo.value : ''
      return { fromDate, toDate }
    }

    const refreshRecordingQueryEstimate = async () => {
      if (!jiminy.getRecordingQueryEstimate || recordingQueryRunning) {
        return
      }
      const state = getState()
      const hasContextFolder = Boolean(state.currentContextFolderPath)
      if (!hasContextFolder) {
        setRecordingQueryEstimate('')
        return
      }

      const { fromDate, toDate } = getRecordingQueryRange()
      if (!fromDate || !toDate || fromDate > toDate) {
        setRecordingQueryEstimate('')
        return
      }

      try {
        const result = await jiminy.getRecordingQueryEstimate({ fromDate, toDate })
        if (result && result.ok) {
          const durationText = formatDurationMs(result.totalDurationMs)
          const sessionCount = Number(result.totalSessions) || 0
          const sessionLabel = sessionCount === 1 ? '1 session' : `${sessionCount} sessions`
          setRecordingQueryEstimate(`Estimated processing time: ${durationText} (${sessionLabel})`)
          return
        }
        const errorCode = result?.error?.code
        if (errorCode === 'NO_SESSIONS' || errorCode === 'NO_SEGMENTS') {
          setRecordingQueryEstimate('No recordings found for this range.')
          return
        }
        setRecordingQueryEstimate('Unable to estimate recording time.')
      } catch (error) {
        console.error('Failed to load recording query estimate', error)
        setRecordingQueryEstimate('Unable to estimate recording time.')
      }
    }

    const scheduleRecordingQueryEstimate = () => {
      if (recordingQueryEstimateTimer) {
        clearTimeout(recordingQueryEstimateTimer)
        recordingQueryEstimateTimer = null
      }

      recordingQueryEstimateTimer = setTimeout(() => {
        recordingQueryEstimateTimer = null
        void refreshRecordingQueryEstimate()
      }, 250)
    }

    const updateRecordingQueryUI = () => {
      const state = getState()
      const currentContextFolderPath = state.currentContextFolderPath || ''
      const hasContextFolder = Boolean(currentContextFolderPath)
      const availability = recordingQueryAvailabilityState || { available: false }
      const isAvailable = availability.available && hasContextFolder
      const isDisabled = !isAvailable || recordingQueryRunning

      if (recordingQueryQuestion) {
        recordingQueryQuestion.disabled = isDisabled
      }
      if (recordingQueryFrom) {
        if (!recordingQueryFrom.value) {
          recordingQueryFrom.value = getTodayDateString()
        }
        recordingQueryFrom.disabled = isDisabled
      }
      if (recordingQueryTo) {
        if (!recordingQueryTo.value) {
          recordingQueryTo.value = getTodayDateString()
        }
        recordingQueryTo.disabled = isDisabled
      }
      if (recordingQuerySubmit) {
        recordingQuerySubmit.disabled = isDisabled
      }
      if (recordingQuerySpinner) {
        setHidden(recordingQuerySpinner, !recordingQueryRunning)
      }

      let availabilityMessage = ''
      if (!availability.available) {
        availabilityMessage = availability.reason || ''
      } else if (!hasContextFolder) {
        availabilityMessage = 'Set a context folder to enable recording queries.'
      }
      setText(recordingQueryAvailability, availabilityMessage)
      setHidden(recordingQueryAvailability, !availabilityMessage)

      const { fromDate, toDate } = getRecordingQueryRange()
      const estimateKey = `${fromDate}|${toDate}|${isAvailable}`
      if (isAvailable && fromDate && toDate && fromDate <= toDate) {
        if (recordingQueryEstimateKey !== estimateKey) {
          recordingQueryEstimateKey = estimateKey
          scheduleRecordingQueryEstimate()
        }
      } else {
        recordingQueryEstimateKey = null
        setRecordingQueryEstimate('')
      }
    }

    const refreshRecordingQueryAvailability = async () => {
      if (!jiminy.getRecordingQueryAvailability) {
        return
      }
      try {
        const availability = await jiminy.getRecordingQueryAvailability()
        recordingQueryAvailabilityState = availability || { available: false, reason: '' }
      } catch (error) {
        console.error('Failed to load recording query availability', error)
        recordingQueryAvailabilityState = { available: false, reason: '' }
      }
      updateRecordingQueryUI()
    }

    const handleRecordingQuerySubmit = async () => {
      if (!jiminy.runRecordingQuery || recordingQueryRunning) {
        return
      }

      setRecordingQueryError('')
      setRecordingQueryAnswer('')
      setRecordingQueryPath('')

      const question = recordingQueryQuestion ? recordingQueryQuestion.value.trim() : ''
      const fromDate = recordingQueryFrom ? recordingQueryFrom.value : ''
      const toDate = recordingQueryTo ? recordingQueryTo.value : ''

      if (!question) {
        setRecordingQueryError('Question is required.')
        return
      }
      if (!fromDate || !toDate) {
        setRecordingQueryError('Both from and to dates are required.')
        return
      }
      if (fromDate > toDate) {
        setRecordingQueryError('From date must be before or equal to To date.')
        return
      }

      recordingQueryRunning = true
      setRecordingQueryStatus('Running...')
      updateRecordingQueryUI()

      try {
        const result = await jiminy.runRecordingQuery({ question, fromDate, toDate })
        if (result && result.ok) {
          setRecordingQueryAnswer(result.answerText || '')
          if (result.queryDir) {
            setRecordingQueryPath(result.queryDir)
          }
          setRecordingQueryStatus('')
        } else {
          setRecordingQueryError(result?.error?.message || 'Recording query failed.')
          if (result?.queryDir) {
            setRecordingQueryPath(result.queryDir)
          }
          setRecordingQueryStatus('')
        }
      } catch (error) {
        console.error('Recording query failed', error)
        setRecordingQueryError('Recording query failed.')
      } finally {
        recordingQueryRunning = false
        setRecordingQueryStatus('')
        updateRecordingQueryUI()
      }
    }

    const refreshRecordingStatus = async () => {
      if (!jiminy.getScreenRecordingStatus) {
        return
      }
      try {
        const result = await jiminy.getScreenRecordingStatus()
        if (result && result.state) {
          currentScreenRecordingState = result.state
          currentScreenRecordingPaused = Boolean(result.manualPaused)
        }
      } catch (error) {
        console.error('Failed to load recording status', error)
      }
      updateRecordingUI()
    }

    const startRecordingPoller = () => {
      if (recordingStatusPoller) {
        return
      }
      recordingStatusPoller = setInterval(refreshRecordingStatus, 2000)
      if (typeof recordingStatusPoller.unref === 'function') {
        recordingStatusPoller.unref()
      }
    }

    const stopRecordingPoller = () => {
      if (recordingStatusPoller) {
        clearInterval(recordingStatusPoller)
        recordingStatusPoller = null
      }
    }

    const handleSectionChange = (nextSection) => {
      if (nextSection === 'recording') {
        void refreshRecordingStatus()
        void refreshRecordingQueryAvailability()
        startRecordingPoller()
        return
      }
      stopRecordingPoller()
    }

    const setPermissionStatus = (status) => {
      currentScreenRecordingPermissionStatus = status || ''
      updateRecordingUI()
    }

    if (recordingActionButton) {
      recordingActionButton.addEventListener('click', async () => {
        const pauseRecording = jiminy.pauseScreenRecording || jiminy.stopScreenRecording
        if (!jiminy.startScreenRecording || !pauseRecording) {
          return
        }
        try {
          if (currentScreenRecordingPaused) {
            await jiminy.startScreenRecording()
          } else if (isRecordingActive()) {
            await pauseRecording()
          } else {
            await jiminy.startScreenRecording()
          }
          await refreshRecordingStatus()
        } catch (error) {
          console.error('Failed to toggle recording', error)
        }
      })
    }

    if (recordingOpenFolderButton) {
      recordingOpenFolderButton.addEventListener('click', async () => {
        if (!jiminy.openRecordingFolder) {
          return
        }
        const state = getState()
        const recordingsPath = buildRecordingsPath(state.currentContextFolderPath || '')
        if (!recordingsPath) {
          return
        }
        try {
          const result = await jiminy.openRecordingFolder()
          if (!result || result.ok !== true) {
            console.error('Failed to open recordings folder', result?.message || result)
          }
        } catch (error) {
          console.error('Failed to open recordings folder', error)
        }
      })
    }

    if (recordingQuerySubmit) {
      recordingQuerySubmit.addEventListener('click', () => {
        void handleRecordingQuerySubmit()
      })
    }

    if (recordingQueryFrom) {
      recordingQueryFrom.addEventListener('change', () => {
        recordingQueryEstimateKey = null
        scheduleRecordingQueryEstimate()
      })
    }

    if (recordingQueryTo) {
      recordingQueryTo.addEventListener('change', () => {
        recordingQueryEstimateKey = null
        scheduleRecordingQueryEstimate()
      })
    }

    return {
      handleSectionChange,
      refreshRecordingStatus,
      setPermissionStatus,
      updateRecordingUI
    }
  }

  const registry = global.JiminyRecording || {}
  registry.createRecording = createRecording
  global.JiminyRecording = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(window)
