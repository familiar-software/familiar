export const DEFAULT_MICROCOPY = {
  app: {
    name: 'Familiar'
  },
  dashboard: {
    sections: {
      wizard: {
        title: 'Setup Wizard'
      },
      storage: {
        title: 'Storage'
      },
      recording: {
        title: 'Capture'
      },
      updates: {
        title: 'Updates'
      },
      installSkill: {
        title: 'Skill'
      }
    },
    settings: {
      confirmMoveContextFolder:
        'Changing the context folder will move all of the captured files along with it',
      statusUpdating: 'Loading settings…',
      statusSaving: 'Saving…',
      statusSaved: 'Saved.',
      statusCopying: 'Copying…',
      statusCopied: 'Copied.',
      statusOpeningFolderPicker: 'Opening folder picker…',
      statusMovingContextFolder: 'Moving context folder…',
      errors: {
        failedToSaveSettings: 'Failed to save settings.',
        failedToSaveSetting: 'Failed to save setting.',
        failedToLoadSettings: 'Failed to load settings.',
        bridgeUnavailableRestart: 'Settings bridge unavailable. Restart the app.',
        captureBridgeUnavailableRestart: 'Capture bridge unavailable. Restart the app.',
        failedToOpenFolderPicker: 'Failed to open folder picker.',
        failedToMoveContextFolder: 'Failed to move context folder.',
        logCopyUnavailableRestart: 'Log copy unavailable. Restart the app.',
        failedToCopyLogFile: 'Failed to copy log file.',
        failedToCheckScreenRecordingPermission: 'Failed to check screen recording permission.',
        failedToUpdateCaptureState: 'Failed to update capture state.',
        storageCleanupUnavailableRestart: 'Storage cleanup unavailable. Restart the app.',
        failedToDeleteFiles: 'Failed to delete files.',
        failedToLoadStorageUsage: 'Failed to load storage usage.'
      }
    },
    recording: {
      startLabel: 'Start capture',
      stopLabel: 'Pause capture',
      onLabel: 'Capturing',
      offLabel: 'Not capturing',
      disabledLabel: 'Capture disabled'
    },
    recordingIndicator: {
      off: 'Off',
      paused: 'Paused',
      permissionNeeded: 'Permission needed',
      capturing: 'Capturing',
      idle: 'Idle'
    },
    updates: {
      checkForUpdatesLabel: 'Check for updates',
      statusCheckingForUpdates: 'Checking for updates…',
      statusAlreadyCheckingForUpdates: 'Already checking for updates…',
      statusNoUpdatesFound: 'No updates found.',
      errors: {
        failedToCheckForUpdates: 'Failed to check for updates.',
        bridgeUnavailableRestart: 'Update bridge unavailable. Restart the app.',
        autoUpdatesDisabled: 'Auto-updates are disabled in this build.'
      }
    },
    settingsActions: {
      openFolder: 'Open in Finder',
      copyLog: 'Copy debug log',
      pickFolder: 'Choose folder',
      moveFolder: 'Move folder',
      remove: 'Delete files',
      save: 'Save',
      refresh: 'Refresh',
      install: 'Install',
      checkPermissions: 'Check permissions'
    },
    actions: {
      wizardDone: 'Done'
    },
    wizardSkill: {
      harnessNames: {
        claude: 'Claude Code',
        codex: 'Codex',
        cursor: 'Cursor'
      },
      messages: {
        installerUnavailableRestart: 'Skill installer unavailable. Restart the app.',
        failedToCheckSkillInstallation: 'Failed to check skill installation.',
        installed: 'Installed.',
        installedAtTemplate: 'Installed at {{path}}',
        installedForTemplate: 'Installed for {{harnesses}}.',
        pathUnavailable: '(path unavailable)',
        installPathsHeader: 'Install paths:',
        chooseHarnessFirst: 'Choose at least one harness first.',
        installing: 'Installing...',
        failedToInstallSkill: 'Failed to connect agent.',
        installedAndFailedTemplate:
          'Installed for {{succeededHarnesses}}. Failed for {{failedHarnesses}}: {{message}}',
        installedAndAdditionalFailureTemplate:
          'Installed for {{succeededHarnesses}}. {{message}}'
      }
    },
    wizard: {
      completeStepToContinue: 'Complete this step to continue.'
    },
    html: {
      settings: {
        errors: {
          failedToSaveSettings: 'Failed to save settings.',
          failedToSaveSetting: 'Failed to save setting.',
          failedToLoadSettings: 'Failed to load settings.',
          bridgeUnavailableRestart: 'Settings bridge unavailable. Restart the app.',
          failedToOpenFolderPicker: 'Failed to open folder picker.',
          failedToMoveContextFolder: 'Failed to move context folder.',
          logCopyUnavailableRestart: 'Log copy unavailable. Restart the app.',
          failedToCopyLogFile: 'Failed to copy log file.',
          storageCleanupUnavailableRestart: 'Storage cleanup unavailable. Restart the app.',
          failedToDeleteFiles: 'Failed to delete files.',
          failedToLoadStorageUsage: 'Failed to load storage usage.'
        }
      }
    }
  },
  general: {
    unknown: '—'
  },
  unknown: '—'
}

// `mode` distinguishes auto-install agents (familiar.installSkill writes
// SKILL.md to the agent's skills dir) from copy-paste agents (the user
// pastes a one-line install prompt into the agent themselves). Step 3 of
// the wizard renders both kinds; the standalone Skill settings section
// filters to install-mode only since copy-paste only makes sense during
// onboarding.
export const HARNESS_OPTIONS = [
  { value: 'claude', label: 'Claude Code', mode: 'install' },
  { value: 'cowork', label: 'Claude Cowork', mode: 'copy-paste' },
  { value: 'codex', label: 'Codex', mode: 'install' },
  { value: 'cursor', label: 'Cursor', mode: 'install' },
  { value: 'localAgent', label: 'Any local agent', mode: 'copy-paste' }
]

// Predicate: does this harness entry use the auto-installer code path?
// Treat missing `mode` as install for forward-compatibility.
export const isInstallMode = (entry) => !entry?.mode || entry.mode === 'install'

export const STORAGE_DELETE_PRESETS = [
  { value: '15m', label: '15 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '7d', label: '7 days' },
  { value: 'all', label: 'all time' }
]

export const DEFAULT_SETTINGS = {
  appVersion: '',
  contextFolderPath: '',
  alwaysRecordWhenActive: false,
  capturePrivacy: {
    blacklistedApps: []
  },
  storageAutoCleanupRetentionDays: 2,
  wizardCompleted: false
}
