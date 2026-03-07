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
        title: 'Capturing'
      },
      updates: {
      title: 'Updates'
      },
    installSkill: {
      title: 'Connect Agent'
    },
      heartbeats: {
        title: 'Heartbeats'
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
        failedToOpenFolderPicker: 'Failed to open folder picker.',
        failedToMoveContextFolder: 'Failed to move context folder.',
        logCopyUnavailableRestart: 'Log copy unavailable. Restart the app.',
        failedToCopyLogFile: 'Failed to copy log file.',
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
        antigravity: 'Antigravity',
        cursor: 'Cursor',
        claudeCowork: 'Claude Cowork'
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
        claudeCoworkGuideUnavailableRestart: 'Claude Cowork guide unavailable. Restart the app.',
        failedToOpenClaudeCoworkGuide: 'Failed to open Claude Cowork guide.',
        installing: 'Installing...',
        openedClaudeCoworkGuide: 'Opened Claude Cowork guide.',
        failedToInstallSkill: 'Failed to connect agent.',
        installedAndFailedTemplate:
          'Installed for {{succeededHarnesses}}. Failed for {{failedHarnesses}}: {{message}}',
        installedAndAdditionalFailureTemplate:
          'Installed for {{succeededHarnesses}}. {{message}}',
        openedClaudeCoworkGuideCombinedTemplate: '{{status}} Opened Claude Cowork guide.'
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

export const HARNESS_OPTIONS = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'antigravity', label: 'Antigravity' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'cloud-cowork', label: 'Claude Cowork' }
]

export const STORAGE_DELETE_PRESETS = [
  { value: '15m', label: '15 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '7d', label: '7 days' },
  { value: 'all', label: 'all time' }
]

export const CLOUD_COWORK_GUIDE_URL =
  'https://github.com/familiar-software/familiar-claude-cowork-skill'

export const DEFAULT_SETTINGS = {
  appVersion: '',
  contextFolderPath: '',
  alwaysRecordWhenActive: false,
  storageAutoCleanupRetentionDays: 2,
  wizardCompleted: false,
  heartbeats: { items: [] }
}

export const HEARTBEAT_RUNNERS = [
  { value: 'codex', label: 'Codex' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'cursor', label: 'Cursor' }
]

export const HEARTBEAT_FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' }
]

export const HEARTBEAT_WEEKDAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' }
]

export const HEARTBEAT_TOPIC_PATTERN = /^[A-Za-z0-9_-]+$/
export const HEARTBEAT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
export const HEARTBEAT_DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
