const microcopy = {
  app: {
    name: 'Familiar'
  },
  toast: {
    pageTitle: 'Toast',
    close: 'Close',
    closeNotification: 'Close notification'
  },
  screenStills: {
    pageTitle: 'Familiar Capturing'
  },
  tray: {
    recording: {
      pausedFor10MinClickToResume: 'Paused for 10 min (click to resume)',
      clickToPauseFor10Min: 'Capturing (click to pause for 10 min)',
      startCapturing: 'Start Capturing'
    },
    actions: {
      settings: 'Settings',
      quit: 'Quit'
    }
  },
  recordingIndicator: {
    off: 'Off',
    paused: 'Paused',
    permissionNeeded: 'Permission needed',
    capturing: 'Capturing',
    idle: 'Idle'
  },
  dashboard: {
    errors: {
      reactInitializationFailed: 'Unable to initialize the React dashboard.'
    },
    html: {
      pageTitle: 'Familiar Settings',
      brandName: 'Familiar',
      appName: 'Familiar',
      sidebarAriaLabelSettingsSections: 'Settings Sections',
      sidebarRecordingAriaLabelToggleCapturing: 'Toggle capturing',
      sidebarRecordingAriaLabelPauseOrResumeCapturing: 'Pause or resume capturing',
      sidebarRecordingActionPauseFor10Min: 'Pause (10 min)',
      navWizard: 'Wizard',
      navStorage: 'Storage',
      updatesCheckForUpdates: 'Check for Updates',
      recordingAriaLabelCapturingSettings: 'Capturing settings',
      recordingPermissionsLabel: 'Permissions',
      recordingCheckPermissions: 'Check Permissions',
      recordingEnableFamiliarInScreenRecording: 'Enable Familiar In Screen Recording',
      recordingAdvancedTitle: 'Advanced',
      recordingBlacklistTitle: 'Apps Blacklist',
      recordingBlacklistDescription:
        'Familiar will not capture your screen if one of the selected apps appears on screen',
      recordingInstalledAppsDescription: 'Search your installed apps.',
      recordingInstalledAppsRefreshing: 'Refreshing...',
      recordingInstalledAppsSearchPlaceholder: 'Search installed apps',
      recordingInstalledAppsEmpty: 'No installed apps were found.',
      recordingInstalledAppsNoSearchResults: 'No installed apps match this search.',
      recordingBlacklistedAppsTitle: 'Selected Apps',
      recordingBlacklistedAppRemove: 'Remove',
      recordingScreenRecordingSettingsNote:
        'Enable access to capture while active in Screen Recording settings.',
      recordingAfterEnablingRestartFamiliar: 'After enabling capturing, restart Familiar',
      recordingCaptureWhileActive: 'Capture screen',
      recordingActionRequiredToProceed: 'Off',
      recordingCapturingIsEnabled: 'Capturing your screen',
      recordingCopyDebugLog: 'Copy Debug Log',
      recordingCopyDebugLogTitle: 'Copies ~/.familiar/logs/familiar.log to your clipboard',
      storageAriaLabelStorageSettings: 'Storage settings',
      storageContextFolder: 'Context Folder',
      storageContextFolderPlaceholderNoFolderSelected: 'No folder selected',
      storageContextFolderChange: 'Change Folder',
      storageOpenInFinder: 'Open in Finder',
      storageUsageBreakdown: 'Usage Breakdown',
      storageUsageComputing: '(Computing)',
      storageUsageCalculating: 'Calculating...',
      storageUsageTextFilesUsing: 'Text files',
      storageUsageScreenshotsUsing: 'Screenshots',
      storageDeleteRecentFilesTitle: 'Delete Recent Files',
      storageDeleteRecentFilesDescription: 'Oops, forgot to turn off recording?',
      storageDeleteWindow15m: '15 minutes',
      storageDeleteWindow1h: '1 hour',
      storageDeleteWindow1d: '1 day',
      storageDeleteWindow7d: '7 days',
      storageDeleteWindowAll: 'all time',
      storageDeleteFiles: 'Delete files',
      storageImagesRetentionTitle: 'Images Retention',
      storageImagesRetentionDescription:
        'Deletes screenshots automatically to save space (markdown files are NOT deleted)',
      storageRetention2d: '2 days',
      storageRetention7d: '7 days',
      installSkillAriaLabelInstallSkillSettings: 'Install skill settings',
      wizardAriaLabelSetupWizard: 'Setup wizard',
      wizardHeaderTitle: 'Setup Wizard',
      wizardHeaderSubtitle: 'Guided setup in five steps.',
      wizardHeaderComplete: 'Setup complete',
      wizardStepContext: 'Storage',
      wizardStepPermissions: 'Permissions',
      wizardStepInstallSkill: 'Agents',
      wizardStepFirstUsecase: 'Try it',
      wizardStepComplete: 'Automate',
      wizardChooseContextFolderTitle: 'Where Familiar stores context for your AI',
      wizardChooseContextFolderDescription:
        'Familiar will create a new folder at that destination called "familiar"',
      wizardContextFolder: 'Context Folder',
      wizardContextFolderSetCta: 'Choose folder',
      wizardContextFolderPlaceholderNoFolderSelected: 'No folder selected',
      wizardContextFolderChange: 'Change',
      wizardContextFolderWhatBody:
        'Familiar takes a screenshot every few seconds and converts it to a text file (same for your clipboard). Open in Finder and watch it live:',
      wizardContextFolderPrivacyBody:
        "Familiar deletes the image file after 2 days, while keeping the markdown file (you can change this in Settings). You can also delete anything manually — it's all files on your computer.",
      wizardContextFolderShowInFinder: 'Watch it happening live',
      wizardContextFolderAdvanced: 'Advanced: choose a different location',
      wizardContextFolderAdvancedNote:
        'Familiar will create a "familiar" folder inside your chosen location.',
      wizardEnableCapturingTitle: 'Enable capturing',
      wizardEnableCapturingDescription:
        'Allow Familiar to capture your screen.',
      wizardCheckPermissions: 'Check Permissions',
      wizardEnableFamiliarInScreenRecording: 'Enable Familiar In Screen Recording',
      wizardAfterEnablingRestartFamiliar: 'After enabling capturing, restart Familiar',
      wizardPermissionChecking: 'Checking Screen Recording permission…',
      wizardPermissionOpenSettings: 'Open System Settings',
      wizardPermissionWaiting: 'Waiting for you to allow Familiar…',
      wizardPermissionWaitingHint: 'Return here after you enable Familiar in Screen Recording.',
      wizardPermissionNudgeHint: 'Make sure the Familiar toggle is turned on, then come back to this window.',
      wizardPermissionGranted: 'Screen Recording is on.',
      wizardInstallSkillTitleBefore: 'Install the Familiar ',
      wizardInstallSkillTitleSkillLink: 'skill',
      wizardInstallSkillDescription:
        "Let your favorite agent use Familiar's context autonomously, or call /familiar as a slash command.",
      wizardHarnessClaudeCode: 'Claude Code',
      wizardHarnessClaudeCowork: 'Claude Cowork',
      wizardHarnessCodex: 'Codex',
      wizardHarnessCursor: 'Cursor',
      wizardHarnessAnyLocalAgent: 'Any local agent',
      wizardRestartConfirmTemplate:
        "I vow I've restarted {{names}} so the skill will actually work (and will not complain when it doesn't work because I didn't restart)",
      wizardAgentInstall: 'Install skill',
      wizardAgentInstalling: 'Installing…',
      wizardAgentInstalled: 'Installed',
      wizardAgentInstalledNeedsRestart: 'Installed, needs restart',
      wizardAgentRetry: 'Failed — try again',
      wizardCopyPasteCopied: 'Copied!',
      wizardSkillInstallPrompt:
        'Install this skill: https://github.com/familiar-software/familiar/tree/main/src/skills/familiar',
      wizardCopyPasteIntroCowork: 'Paste into Cowork chat:',
      wizardCopyPasteIntroLocalAgent: 'Paste into your agent chat:',
      wizardReadTheSkillUrl:
        'https://github.com/familiar-software/familiar/blob/main/src/skills/familiar/SKILL.md',
      wizardFirstUsecaseTitle: 'Paste this in your favorite agent',
      wizardFirstUsecaseDescription: '',
      wizardFirstUsecaseCommand: '/familiar what did I do in the last few minutes',
      wizardFirstUsecaseGifAlt:
        'Demo showing how to ask Familiar what you did recently from your AI agent.',
      wizardTryItPinkySwear:
        "I pinky pinky super swear that I did this because it'd be such a waste if I didn't do this and this is so damn cool and I really would be missing out.",
      wizardAutomateTitle: "What should your AI auto-update with Familiar's context?",
      wizardAutomateDescription: '',
      wizardDestMemory: 'Native memory',
      wizardDestMemoryDesc: 'Your agent remembers what you do without you telling it',
      wizardDestSkills: 'Custom skills',
      wizardDestSkillsDesc: 'Your skills evolve as your work does',
      wizardDestKnowledgeBase: 'Personal knowledge base',
      wizardDestKnowledgeBaseDesc:
        'A wiki, vault, or second brain stays current automatically',
      wizardDestManual: "Don't auto-update, I'll just use the skill",
      wizardDestManualDesc: '',
      wizardDestKnowledgeBaseChoose: 'Choose',
      wizardDestKnowledgeBasePlaceholder: 'No folder selected',
      wizardAutomatePromptLabel: 'Paste this as a <link> in your agent:',
      wizardAutomateCopy: 'Copy',
      wizardAutomateCopied: 'Copied',
      wizardAutomateHelpHeading: 'Paste this as a scheduled task in your agent:',
      wizardAutomateHelpLink: 'How to set up',
      wizardAutomateManualOnlyNote:
        'No scheduled task needed — just call /familiar in your agent whenever you want context. You can always set up automation later in Settings.',
      wizardBack: 'Back',
      wizardNext: 'Next',
      wizardDone: 'Done',
      completeHeadline: 'Success! Familiar lives up there now.',
      completeCloseLink: 'Close this window',
      completeTryBody: 'and head to your favorite agent and type',
      completeTryCommand: '/familiar',
      completeNotSurePrompt: 'Not sure what to ask?',
      completeIdeasLinkLabel: 'Examples to get your imagination going',
      completeIdeasLinkHref: 'https://www.looksfamiliar.org/#use-cases'
    },
    sections: {
      wizard: {
        title: 'Setup Wizard',
        subtitle: 'Guided setup in five steps.'
      },
      updates: {
        title: 'Updates',
        subtitle: 'Check for new versions and download when available.'
      },
      recording: {
        title: 'Capture'
      },
      storage: {
        title: 'Storage'
      },
      installSkill: {
        title: 'Skill'
      }
    },
    stills: {
      checkPermissions: 'Check Permissions',
      checkingPermissions: 'Checking...',
      permissionsGranted: 'Granted',
      setContextFolderToEnableStills: 'Set a context folder to enable stills.',
      paused: 'Paused',
      capturing: 'Capturing',
      notCapturing: 'Not capturing',
      startCapture: 'Start capture',
      resume: 'Resume',
      pauseFor10Min: 'Pause (10 min)'
    },
    settings: {
      statusUpdating: 'Loading settings...',
      moduleUnavailableRestart: 'Settings module unavailable. Restart the app.',
      statusSaving: 'Saving...',
      statusSaved: 'Saved.',
      statusOpeningFolderPicker: 'Opening folder picker...',
      statusMovingContextFolder: 'Moving context folder...',
      statusCopying: 'Copying...',
      statusCopied: 'Copied.',
      confirmMoveContextFolder:
        'Changing the context folder will move all of the captured files along with it',
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
      },
      deletedFiles: 'Deleted files.',
      confirmAutoCleanupRetentionTemplate:
        'Change auto cleanup retention to {{retentionDays}} days?\n\nThis will run cleanup using the new retention setting.'
    },
    updates: {
      checkForUpdatesLabel: 'Check for updates',
      statusCheckingForUpdates: 'Checking for updates...',
      statusAlreadyCheckingForUpdates: 'Already checking for updates...',
      statusNoUpdatesFound: 'No updates found.',
      statusUpdateAvailableTemplate:
        'Update available: {{currentVersion}} -> {{version}}. You will be prompted to download.',
      errors: {
        bridgeUnavailableRestart: 'Update bridge unavailable. Restart the app.',
        autoUpdatesDisabled: 'Auto-updates are disabled in this build.',
        failedToCheckForUpdates: 'Failed to check for updates.'
      },
      progress: {
        downloadingTemplate: 'Downloading update... {{percent}}%',
        downloadCompleteNoVersion: 'Download complete. Restart to install.',
        downloadCompleteWithVersionTemplate: 'Download complete. Restart to install {{version}}.'
      }
    },
    wizard: {
      completeStepToContinue: 'Complete this step to continue.'
    },
    settingsActions: {
      openFolder: 'Open in Finder',
      copyLog: 'Copy debug log',
      pickFolder: 'Choose folder',
      moveFolder: 'Change Folder',
      save: 'Save',
      refresh: 'Refresh',
      install: 'Install',
      checkPermissions: 'Check Permissions'
    },
    actions: {
      wizardDone: 'Done'
    },
    recording: {
      startLabel: 'Start capture',
      stopLabel: 'Pause capture',
      onLabel: 'Capturing',
      offLabel: 'Not capturing',
      disabledLabel: 'Capture disabled',
      installedAppsLoadFailed: 'Failed to load installed apps'
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
        installedAndAdditionalFailureTemplate: 'Installed for {{succeededHarnesses}}. {{message}}'
      }
    },
    storageUsage: {
      errors: {
        unavailableRestart: 'Storage usage unavailable. Restart the app.',
        failedToLoad: 'Failed to load storage usage.'
      }
    }
  },
  general: {
    unknown: '—'
  }
}

const api = { microcopy }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api
}
