import { useCallback, useRef, useState } from 'react'
import { buildDashboardShellMicrocopy } from './dashboardShellMicrocopy'
import { HARNESS_OPTIONS, STORAGE_DELETE_PRESETS, DEFAULT_SETTINGS } from './dashboardConstants'
import {
  formatTemplate,
  normalizeHarnessArray,
  resolveAutoCleanupRetentionDays
} from './dashboardUtils'
import { useTimedMessage } from '../hooks/useTimedMessage'
import dashboardShellNavigationRules from './dashboardShellNavigationRules.cjs'
import dashboardWizardRules from './dashboardWizardRules.cjs'

export const useDashboardState = ({ familiar, microcopy = {}, formatters = null }) => {
  const { resolveInitialActiveSection } = dashboardShellNavigationRules
  const { resolveInitialWizardStep } = dashboardWizardRules
  const mc = buildDashboardShellMicrocopy(microcopy)
  const wizardHarnessNameMap = mc.dashboard.wizardSkill.harnessNames
  const supportedHarnessValues = new Set(HARNESS_OPTIONS.map((entry) => entry.value))
  const wizardHarnessOptions = HARNESS_OPTIONS.map((entry) => ({
    ...entry,
    label: wizardHarnessNameMap[entry.value] || entry.label
  }))
  const recordingCopy = mc.dashboard?.recording || {
    startLabel: 'Start capture',
    stopLabel: 'Pause capture',
    onLabel: 'Capturing',
    offLabel: 'Not capturing',
    disabledLabel: 'Capture disabled'
  }

  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [recordingStatus, setRecordingStatus] = useState({
    state: 'disabled',
    manualPaused: false,
    enabled: false,
    permissionGranted: true,
    permissionStatus: 'granted'
  })
  const [storageUsage, setStorageUsage] = useState({
    screenshotsBytes: 0,
    steelsMarkdownBytes: 0
  })
  const [storageUsageLoaded, setStorageUsageLoaded] = useState(false)
  const [copyLogMessage, setCopyLogMessage] = useTimedMessage('')
  const [copyLogError, setCopyLogError] = useTimedMessage('')
  const [isCopyingDebugLog, setIsCopyingDebugLog] = useState(false)
  const [selectedHarnesses, setSelectedHarnesses] = useState([])
  const [skillInstallPaths, setSkillInstallPaths] = useState({})
  const [isSkillInstalled, setIsSkillInstalled] = useState(false)
  const [isWizardCompleted, setIsWizardCompleted] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [activeSection, setActiveSection] = useState('wizard')
  const [globalMessage, setGlobalMessage] = useTimedMessage('')
  const [globalError, setGlobalError] = useTimedMessage('')
  const [recordingMessage, setRecordingMessage] = useTimedMessage('')
  const [recordingError, setRecordingError] = useTimedMessage('')
  const [storageMessage, setStorageMessage] = useTimedMessage('')
  const [storageError, setStorageError] = useTimedMessage('')
  const [skillMessage, setSkillMessage] = useTimedMessage('')
  const [skillError, setSkillError] = useTimedMessage('')
  const [updateMessage, setUpdateMessage] = useTimedMessage('')
  const [updateError, setUpdateError] = useTimedMessage('')
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false)
  const [wizardMessage, setWizardMessage] = useTimedMessage('')
  const [wizardError, setWizardError] = useTimedMessage('')
  const [deleteWindow, setDeleteWindow] = useState(STORAGE_DELETE_PRESETS[0].value)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [storageDeleteMessage, setStorageDeleteMessage] = useTimedMessage('')
  const [storageDeleteError, setStorageDeleteError] = useTimedMessage('')
  const [contextFolderMoveInProgress, setContextFolderMoveInProgress] = useState(false)
  const [updatesState, setUpdatesState] = useState({ percent: 0, visible: false, label: '' })
  const [statusBusy, setStatusBusy] = useState(false)
  const hasManualHarnessSelectionRef = useRef(false)

  const getHarnessesFromState = useCallback(() => selectedHarnesses, [selectedHarnesses])
  const hasLoadedSettingsRef = useRef(false)
  const isLoadingSettingsRef = useRef(false)
  const lastWindowOpenStorageRefreshRef = useRef(0)
  const mountedRef = useRef(false)

  const getRecorderPath = useCallback(
    (state = DEFAULT_SETTINGS) =>
      state.contextFolderPath
        ? `${state.contextFolderPath}/familiar/stills`
        : mc.general.unknown,
    [mc.general.unknown]
  )

  const toDisplayedContextFolderPath = useCallback((value) => {
    if (typeof value !== 'string') {
      return ''
    }
    const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
    if (!normalized) {
      return ''
    }
    const normalizedWithFamiliar = normalized.endsWith('/familiar')
      ? normalized
      : `${normalized}/familiar`
    if (normalized.toLowerCase().endsWith('/familiar')) {
      return normalized
    }
    const segments = normalizedWithFamiliar.split('/').filter(Boolean)
    const shouldShorten = normalizedWithFamiliar.length > 48 && segments.length > 4
    if (shouldShorten) {
      return `.../${segments.slice(-4).join('/')}`
    }
    return normalizedWithFamiliar
  }, [])

  const toWizardContextFolderPath = useCallback((value) => {
    if (typeof value !== 'string') {
      return ''
    }
    const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
    if (!normalized) {
      return ''
    }
    return normalized.endsWith('/familiar') ? normalized : `${normalized}/familiar`
  }, [])

  const displayedContextFolderPath = toDisplayedContextFolderPath(settings.contextFolderPath)
  const wizardContextFolderPath = toWizardContextFolderPath(settings.contextFolderPath)

  const localFormatters = {
    autoCleanupRetentionConfirm: (retentionDays) =>
      formatTemplate(
        mc.dashboard?.settings?.confirmAutoCleanupRetentionTemplate ||
          'Change auto cleanup retention to {{retentionDays}} days?\n\nThis will run cleanup using the new retention setting.',
        { retentionDays }
      ),
    updateAvailable: ({ currentVersion, version }) =>
      formatTemplate(
        mc.dashboard.updates.progress.downloadCompleteWithVersionTemplate ||
          'Update available: {{currentVersion}} -> {{version}}. You will be prompted to download.',
        { currentVersion, version }
      ),
    updateDownloading: (percent) => formatTemplate(mc.dashboard.updates.progress.downloadingTemplate, { percent }),
    updateDownloadComplete: ({ version }) =>
      version
        ? formatTemplate(mc.dashboard.updates.progress.downloadCompleteWithVersionTemplate, { version })
        : mc.dashboard.updates.progress.downloadCompleteNoVersion,
    wizardSkillInstalledAt: (path) => formatTemplate(mc.dashboard.wizardSkill.messages.installedAtTemplate, { path }),
    wizardSkillInstalledFor: (harnesses) =>
      formatTemplate(mc.dashboard.wizardSkill.messages.installedForTemplate, { harnesses }),
    wizardSkillInstalledAndFailed: ({ succeededHarnesses, failedHarnesses, message }) =>
      formatTemplate(mc.dashboard.wizardSkill.messages.installedAndFailedTemplate, {
        succeededHarnesses,
        failedHarnesses,
        message
      }),
    wizardSkillInstalledAndAdditionalFailure: ({ succeededHarnesses, message }) =>
      formatTemplate(mc.dashboard.wizardSkill.messages.installedAndAdditionalFailureTemplate, {
        succeededHarnesses,
        message
      })
  }
  const displayFormatters = formatters || localFormatters

  const setStatusBusySafe = useCallback(
    (next) => {
      if (!mountedRef.current) {
        return
      }
      setStatusBusy(Boolean(next))
    },
    [mountedRef]
  )

  const normalizeHarnesses = useCallback((value) => normalizeHarnessArray(value), [])
  const getInstallableHarnesses = useCallback(
    (value) => normalizeHarnesses(value),
    [normalizeHarnesses]
  )
  const getHarnessLabel = useCallback(
    (value) => {
      if (value === 'claude') {
        return wizardHarnessNameMap.claude
      }
      if (value === 'codex') {
        return wizardHarnessNameMap.codex
      }
      if (value === 'antigravity') {
        return wizardHarnessNameMap.antigravity
      }
      if (value === 'cursor') {
        return wizardHarnessNameMap.cursor
      }
      return value
    },
    [wizardHarnessNameMap]
  )

  const applySettingsDefaults = useCallback(
    (next = {}) => {
      const skillInstaller = next.skillInstaller || {}
      const nextHarnesses = normalizeHarnesses([
        ...(normalizeHarnesses(skillInstaller.harness)),
        ...(normalizeHarnesses(skillInstaller.harnesses))
      ]).filter((entry) => supportedHarnessValues.has(entry))
      if (!hasManualHarnessSelectionRef.current) {
        setSelectedHarnesses(nextHarnesses)
      }
      const nextSettings = {
        appVersion:
          typeof next.appVersion === 'string' ? next.appVersion : DEFAULT_SETTINGS.appVersion,
        contextFolderPath:
          typeof next.contextFolderPath === 'string'
            ? next.contextFolderPath
            : DEFAULT_SETTINGS.contextFolderPath,
        alwaysRecordWhenActive: Boolean(next.alwaysRecordWhenActive),
        capturePrivacy: {
          blacklistedApps: Array.isArray(next?.capturePrivacy?.blacklistedApps)
            ? next.capturePrivacy.blacklistedApps
            : DEFAULT_SETTINGS.capturePrivacy.blacklistedApps
        },
        storageAutoCleanupRetentionDays:
          resolveAutoCleanupRetentionDays(next.storageAutoCleanupRetentionDays),
        wizardCompleted: next.wizardCompleted === true,
        homedir: typeof next.homedir === 'string' ? next.homedir : ''
      }
      setSettings(nextSettings)
      setIsWizardCompleted(nextSettings.wizardCompleted)
      setWizardStep(resolveInitialWizardStep({ settings: nextSettings }))
      setActiveSection(resolveInitialActiveSection(nextSettings.wizardCompleted))
      return nextSettings
    },
    [normalizeHarnesses, resolveInitialWizardStep, setActiveSection, supportedHarnessValues]
  )

  const saveSettings = useCallback(async (payload) => {
    if (!familiar || typeof familiar.saveSettings !== 'function') {
      return false
    }
    const result = await familiar.saveSettings(payload)
    return Boolean(result && result.ok)
  }, [familiar])

  return {
    familiar,
    mc,
    wizardHarnessOptions,
    recordingCopy,
    settings,
    setSettings,
    recordingStatus,
    setRecordingStatus,
    storageUsage,
    setStorageUsage,
    storageUsageLoaded,
    setStorageUsageLoaded,
    copyLogMessage,
    setCopyLogMessage,
    copyLogError,
    setCopyLogError,
    isCopyingDebugLog,
    setIsCopyingDebugLog,
    selectedHarnesses,
    setSelectedHarnesses,
    skillInstallPaths,
    setSkillInstallPaths,
    isSkillInstalled,
    setIsSkillInstalled,
    isWizardCompleted,
    setIsWizardCompleted,
    wizardStep,
    setWizardStep,
    activeSection,
    setActiveSection,
    globalMessage,
    setGlobalMessage,
    globalError,
    setGlobalError,
    recordingMessage,
    setRecordingMessage,
    recordingError,
    setRecordingError,
    storageMessage,
    setStorageMessage,
    storageError,
    setStorageError,
    skillMessage,
    setSkillMessage,
    skillError,
    setSkillError,
    updateMessage,
    setUpdateMessage,
    updateError,
    setUpdateError,
    isCheckingForUpdates,
    setIsCheckingForUpdates,
    wizardMessage,
    setWizardMessage,
    wizardError,
    setWizardError,
    deleteWindow,
    setDeleteWindow,
    deleteBusy,
    setDeleteBusy,
    storageDeleteMessage,
    setStorageDeleteMessage,
    storageDeleteError,
    setStorageDeleteError,
    contextFolderMoveInProgress,
    setContextFolderMoveInProgress,
    updatesState,
    setUpdatesState,
    hasLoadedSettingsRef,
    hasManualHarnessSelectionRef,
    setManualHarnessSelection: (next) => {
      hasManualHarnessSelectionRef.current = Boolean(next)
    },
    isLoadingSettingsRef,
    lastWindowOpenStorageRefreshRef,
    statusBusy,
    setStatusBusy,
    setStatusBusySafe,
    mountedRef,
    getHarnessesFromState,
    localFormatters,
    displayFormatters,
    normalizeHarnesses,
    getInstallableHarnesses,
    getHarnessLabel,
    getRecorderPath,
    displayedContextFolderPath,
    wizardContextFolderPath,
    toDisplayedContextFolderPath,
    toWizardContextFolderPath,
    applySettingsDefaults,
    saveSettings
  }
}
