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
      navCapturing: 'Capturing',
      navInstallSkill: 'Connect Agent',
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
      wizardStepInstallSkill: 'Skills',
      wizardStepFirstUsecase: 'Showcase',
      wizardStepComplete: 'Complete',
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
      wizardCaptureWhileActive: 'Capture screen',
      wizardActionRequiredToProceed: 'Off',
      wizardCapturingIsEnabled: 'Capturing your screen',
      wizardInstallSkillTitle: 'Choose where you work',
      wizardInstallSkillDescription: "Familiar's skill will be installed in the tools you choose",
      wizardHarnessClaudeCode: 'Claude Code',
      wizardHarnessCodex: 'Codex',
      wizardHarnessAntigravity: 'Antigravity',
      wizardHarnessCursor: 'Cursor',
      wizardCursorRestartNote: 'Restart Cursor for the skill to take effect.',
      wizardFirstUsecaseTitle: 'You can already try your first Familiar use case!',
      wizardFirstUsecaseDescription:
        "Open one of the tools where you intalled Familiar's skill and type the following:",
      wizardFirstUsecaseCommand: '/familiar what have I done in the last 5 minutes',
      wizardFirstUsecaseHowItWorks:
        'Familiar reads the recent context it has been capturing and returns a grounded answer in your agent.',
      wizardFirstUsecaseGifAlt:
        'Demo showing how to ask Familiar what you did in the last 5 minutes from your AI agent.',
      wizardAllSetTitle: "You're all set",
      wizardAllSetDescription:
        'Familiar is ready. It will capture what matters and make it available to your agents.',
      wizardFaqTitle: 'FAQ',
      wizardFaqScrollHint: 'Scroll down to see all FAQs',
      wizardFaqQuestionHowItWorks: 'How does Familiar work?',
      wizardFaqAnswerHowItWorks:
        'Familiar is a macOS desktop app. It runs in the background and takes screenshots while you work. Those screenshots are converted into markdown files. When you invoke the Familiar skill, your agent reads the relevant markdown files to answer your question.',
      wizardFaqQuestionData: 'What happens to my data?',
      wizardFaqAnswerData:
        "All data stays on your machine. We don't have access to any of it.",
      wizardFaqQuestionSensitiveData: 'Will it capture passwords or embarrassing searches?',
      wizardFaqAnswerSensitiveData:
        'Familiar has two layers of protection. First, Familiar allows you to blacklist apps so nothing is captured while they are visible. Second, it automatically redacts passwords, API keys, and credit card numbers from the text conversion.',
      wizardFaqQuestionRetention: 'How far back does it retain information?',
      wizardFaqAnswerRetention:
        'Markdown files are kept indefinitely. Screenshots are deleted after 2 days, though this is configurable.',
      wizardFaqQuestionStorage: "Doesn't all the context take too much space?",
      wizardFaqAnswerStorage:
        'Familiar is optimized to take minimal space on disk. You can run it for months without noticing the storage impact.',
      wizardFaqQuestionBattery: 'What about battery life?',
      wizardFaqAnswerBattery:
        'Familiar is optimized to minimize battery usage. If your Mac is unplugged, it switches to low power mode and captures less context to preserve battery life.',
      wizardFaqQuestionScreenshotFrequency: 'How often does it take a screenshot?',
      wizardFaqAnswerScreenshotFrequency:
        "Every few seconds, and only while you're active on your computer.",
      wizardFaqQuestionMonitors:
        'Does it support multiple monitors? Which screen gets captured?',
      wizardFaqAnswerMonitors:
        'Familiar captures only the monitor your mouse cursor is on. If your mouse is on the left screen, the right screen is not captured.',
      wizardFaqQuestionAgents: 'What AI agents does it work with?',
      wizardFaqAnswerAgents:
        'At the moment, Familiar works with AI agents that run on a local filesystem, like Claude Code, Cursor, Codex Antigravity, and OpenClaw.',
      wizardFaqQuestionNoise:
        'How does it cut through noise and surface only what matters?',
      wizardFaqAnswerNoise:
        "Models from leading providers are getting better at extracting valuable information from large amounts of data. They are already capable of ingesting Familiar's context and pulling out what you're looking for.",
      wizardFaqQuestionAudio:
        'Does Familiar capture audio or transcribe meetings or calls?',
      wizardFaqAnswerAudio:
        "Not at the moment. We're hearing a lot of demand for this and want to be thoughtful about it. For now, we're focused on visual content.",
      wizardFaqQuestionFree: 'Is Familiar free?',
      wizardFaqAnswerFree:
        'Yes. Familiar will stay open source and free to use.',
      wizardFaqQuestionWhyOwl: 'Why an owl?',
      wizardFaqAnswerWhyOwl:
        'An owl is a common "familiar," a companion spirit in folklore. We also aspire to use this to make AI a little wiser.',
      wizardBack: 'Back',
      wizardNext: 'Next',
      wizardDone: 'Done'
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
        title: 'Capturing'
      },
      storage: {
        title: 'Storage'
      },
      installSkill: {
        title: 'Connect Agent'
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
        antigravity: 'Antigravity',
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
