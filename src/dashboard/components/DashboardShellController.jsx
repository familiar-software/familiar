import React, { useCallback } from 'react'

import { DashboardShellLayout } from './layout/DashboardShellLayout'
import { DashboardShellSectionContent } from './sections/DashboardShellSectionContent'
import {
  buildDashboardNavigation,
} from './dashboard/DashboardShellNavigation'
import { useDashboardCapture } from './dashboard/useDashboardCapture'
import { useDashboardCapturePrivacy } from './dashboard/useDashboardCapturePrivacy'
import { useDashboardLifecycle } from './dashboard/useDashboardLifecycle'
import { useDashboardSkills } from './dashboard/useDashboardSkills'
import { useDashboardState } from './dashboard/useDashboardState'
import { useDashboardStorage } from './dashboard/useDashboardStorage'
import { useDashboardUpdates } from './dashboard/useDashboardUpdates'
import { useDashboardWizard } from './dashboard/useDashboardWizard'
import {
  resolveRecordingIndicatorVisuals,
  formatBytes,
  toDisplayText
} from './dashboard/dashboardUtils'
import dashboardShellNavigationRules from './dashboard/dashboardShellNavigationRules.cjs'

function DashboardShellController({ familiar, microcopy = {}, formatters = null }) {
  const { resolveSectionSelection } = dashboardShellNavigationRules
  const core = useDashboardState({
    familiar,
    microcopy,
    formatters
  })

  const skills = useDashboardSkills(core)
  const lifecycle = useDashboardLifecycle(core, {
    onInitialHarnessesLoaded: (initialHarnesses) => skills.checkSkillInstallStatus(initialHarnesses)
  })
  const capture = useDashboardCapture({
    ...core,
    refreshRecordingStatus: lifecycle.refreshRecordingStatus
  })
  const capturePrivacy = useDashboardCapturePrivacy(core)
  const storage = useDashboardStorage(core, lifecycle)
  const updates = useDashboardUpdates(core)
  const wizard = useDashboardWizard({
    mc: core.mc,
    settings: core.settings,
    wizardStep: core.wizardStep,
    isSkillInstalled: core.isSkillInstalled,
    getHarnessesFromState: core.getHarnessesFromState,
    saveSettings: core.saveSettings,
    setWizardStep: core.setWizardStep,
    setWizardError: core.setWizardError,
    setWizardMessage: core.setWizardMessage,
    setActiveSection: core.setActiveSection,
    setIsWizardCompleted: core.setIsWizardCompleted
  })
  const checkWizardPermissions = useCallback(async () => {
    core.setWizardError('')
    core.setWizardMessage('')

    const result = await capture.checkPermissions()
    if (result?.permissionCheckState !== 'granted') {
      return result
    }

    const didEnableCaptureWhileActive = await storage.setAlwaysRecord(true)
    if (!didEnableCaptureWhileActive) {
      core.setWizardError(core.mc.dashboard.settings.errors.failedToSaveSetting)
    }

    return {
      ...result,
      autoEnabledCaptureWhileActive: didEnableCaptureWhileActive
    }
  }, [
    capture,
    core.mc.dashboard.settings.errors.failedToSaveSetting,
    core.setWizardError,
    core.setWizardMessage,
    storage
  ])

  const navigation = buildDashboardNavigation(core.mc)
  const availableSectionIds = navigation.map((entry) => entry.id)
  const wizardCompleteMessage = core.mc.dashboard?.wizard?.completeStepToContinue

  const setStorageSection = useCallback(
    (nextSection) => {
      const sectionSelection = resolveSectionSelection({
        isWizardCompleted: core.isWizardCompleted,
        nextSection,
        availableSectionIds
      })
      if (!sectionSelection.allowed) {
        if (sectionSelection.showError) {
          core.setGlobalError(wizardCompleteMessage)
        }
        return
      }
      core.setGlobalError('')
      core.setActiveSection(nextSection)
    },
    [availableSectionIds, core, wizardCompleteMessage]
  )

  const recordingIndicator = resolveRecordingIndicatorVisuals({
    enabled: core.recordingStatus.enabled,
    state: core.recordingStatus.state,
    manualPaused: core.recordingStatus.manualPaused,
    permissionGranted: core.recordingStatus.permissionGranted,
    permissionStatus: core.recordingStatus.permissionStatus,
    copy: core.mc.dashboard.recordingIndicator
  })

  return (
      <DashboardShellLayout
        activeSection={core.activeSection}
        navigation={navigation}
        isWizardCompleted={core.isWizardCompleted}
        globalMessage={core.globalMessage}
        globalError={core.globalError}
        appName={core.mc.app?.name}
        updatesCheckForUpdatesLabel={toDisplayText(core.mc.dashboard?.updates?.checkForUpdatesLabel)}
        onCheckForUpdates={updates.checkForUpdates}
        isCheckingForUpdates={core.isCheckingForUpdates}
        updateMessage={core.updateMessage}
        updateError={core.updateError}
        updatesState={core.updatesState}
        onSectionSelect={setStorageSection}
      toDisplayText={toDisplayText}
    >
      <DashboardShellSectionContent
        activeSection={core.activeSection}
        mc={core.mc}
        toDisplayText={toDisplayText}
        wizardSectionProps={{
          displayedContextFolderPath: core.displayedContextFolderPath,
          wizardContextFolderPath: core.wizardContextFolderPath,
          wizardStep: core.wizardStep,
          wizardError: core.wizardError,
          settings: core.settings,
          storageMessage: core.storageMessage,
          storageError: core.storageError,
          isWizardStepComplete: wizard.isWizardStepComplete,
          goWizardBack: wizard.goWizardBack,
          goWizardNext: wizard.goWizardNext,
          completeWizard: wizard.completeWizard,
          pickContextFolder: storage.pickContextFolder,
          checkPermissions: checkWizardPermissions,
          openScreenRecordingSettings: capture.openScreenRecordingSettings,
          permissionCheckState: capture.permissionCheckState,
          wizardHarnessOptions: core.wizardHarnessOptions,
          selectedHarnesses: core.selectedHarnesses,
          skillInstallPaths: core.skillInstallPaths,
          handleHarnessChange: skills.handleHarnessChange,
          skillMessage: core.skillMessage,
          skillError: core.skillError,
          wizardMessage: core.wizardMessage,
          recordingStatus: core.recordingStatus
        }}
        recordingSectionProps={{
          mc: core.mc,
          toDisplayText,
          recordingStatus: core.recordingStatus,
          recordingIndicator,
          settings: core.settings,
          recordingMessage: core.recordingMessage,
          recordingError: core.recordingError,
          recordingCopy: core.recordingCopy,
          setAlwaysRecord: storage.setAlwaysRecord,
          checkPermissions: capture.checkPermissions,
          openScreenRecordingSettings: capture.openScreenRecordingSettings,
          permissionCheckState: capture.permissionCheckState,
          copyDebugLog: storage.copyDebugLog,
          copyLogBusy: core.isCopyingDebugLog,
          copyLogMessage: core.copyLogMessage,
          copyLogError: core.copyLogError,
          installedApps: capturePrivacy.installedApps,
          filteredInstalledApps: capturePrivacy.filteredInstalledApps,
          installedAppsLoading: capturePrivacy.installedAppsLoading,
          installedAppsError: capturePrivacy.installedAppsError,
          appSearchQuery: capturePrivacy.appSearchQuery,
          setAppSearchQuery: capturePrivacy.setAppSearchQuery,
          installedAppIcons: capturePrivacy.installedAppIcons,
          capturePrivacyMessage: capturePrivacy.capturePrivacyMessage,
          capturePrivacyError: capturePrivacy.capturePrivacyError,
          refreshInstalledApps: capturePrivacy.refreshInstalledApps,
          setBlacklistedAppEnabled: capturePrivacy.setBlacklistedAppEnabled,
          requestInstalledAppIcon: capturePrivacy.requestInstalledAppIcon
        }}
        installSectionProps={{
          mc: core.mc,
          wizardHarnessOptions: core.wizardHarnessOptions,
          selectedHarnesses: core.selectedHarnesses,
          handleHarnessChange: skills.handleHarnessChange,
          skillInstallPaths: core.skillInstallPaths,
          isSkillInstalled: core.isSkillInstalled,
          skillMessage: core.skillMessage,
          skillError: core.skillError
        }}
        storageSectionProps={{
          mc: core.mc,
          toDisplayText,
          displayedContextFolderPath: core.displayedContextFolderPath,
          settings: core.settings,
          storageUsage: core.storageUsage,
          storageUsageLoaded: core.storageUsageLoaded,
          storageMessage: core.storageMessage,
          storageError: core.storageError,
          storageDeleteMessage: core.storageDeleteMessage,
          storageDeleteError: core.storageDeleteError,
          deleteBusy: core.deleteBusy,
          deleteWindow: core.deleteWindow,
          setDeleteWindow: core.setDeleteWindow,
          pickContextFolder: storage.pickContextFolder,
          openCurrentContextFolder: storage.openCurrentContextFolder,
          saveStorageRetention: storage.saveStorageRetention,
          isContextFolderMoveInProgress: storage.isContextFolderMoveInProgress,
          isDeleteControlsDisabled: storage.isDeleteControlsDisabled,
          deleteRecentFiles: storage.deleteRecentFiles,
          formatBytes
        }}
      />
    </DashboardShellLayout>
  )
}

export default DashboardShellController
