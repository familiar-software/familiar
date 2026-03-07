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
    heartbeats: {
      section: 'Heartbeats'
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
      recordingAfterEnablingRestartFamiliar: 'After enabling capturing, restart Familiar',
      recordingCaptureWhileActive: 'Capture While Active',
      recordingActionRequiredToProceed: 'Action required to proceed',
      recordingCapturingIsEnabled: 'Capturing is enabled',
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
      storageUsageTextFilesUsing: 'Text files using',
      storageUsageScreenshotsUsing: 'Screenshots using',
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
      wizardHeaderSubtitle: 'Guided setup in four steps.',
      wizardHeaderComplete: 'Setup complete',
      wizardStepContext: 'Context',
      wizardStepPermissions: 'Permissions',
      wizardStepInstallSkill: 'Skills',
      wizardStepComplete: 'Complete',
      wizardChooseContextFolderTitle: 'Choose your context folder',
      wizardChooseContextFolderDescription:
        'Familiar stores everything inside <Context Folder>/familiar/.',
      wizardChooseContextFolderBestPracticesLabel: 'Best Practices:',
      wizardChooseContextFolderBestPractices:
        'Use the same folder with which you usually work with agents.',
      wizardContextFolder: 'Context Folder',
      wizardContextFolderPlaceholderNoFolderSelected: 'No folder selected',
      wizardContextFolderChange: 'Change',
      wizardEnableCapturingTitle: 'Enable capturing',
      wizardEnableCapturingDescription:
        'Captures a still while you are active, and stops when idle. Requires Screen Recording permission.',
      wizardCheckPermissions: 'Check Permissions',
      wizardEnableFamiliarInScreenRecording: 'Enable Familiar In Screen Recording',
      wizardAfterEnablingRestartFamiliar: 'After enabling capturing, restart Familiar',
      wizardCaptureWhileActive: 'Capture while active',
      wizardActionRequiredToProceed: 'Action required to proceed',
      wizardCapturingIsEnabled: 'Capturing is enabled',
      wizardInstallSkillTitle: 'Set up Familiar in your tools',
      wizardInstallSkillDescription: 'Pick where Familiar should be available',
      wizardHarnessClaudeCode: 'Claude Code',
      wizardHarnessClaudeCowork: 'Claude Cowork',
      wizardHarnessCodex: 'Codex',
      wizardHarnessAntigravity: 'Antigravity',
      wizardHarnessCursor: 'Cursor',
      wizardCursorRestartNote: 'Restart Cursor for the skill to take effect.',
      wizardClaudeCoworkGuideTitle: 'Claude Cowork install guide',
      wizardClaudeCoworkGuideSubtitle: 'Use marketplace installation in Cowork.',
      wizardClaudeCoworkGuideStep1: 'Open Settings from the top left corner (or press: ⌘ + , ).',
      wizardClaudeCoworkGuideStep2: 'Go to Capabilities.',
      wizardClaudeCoworkGuideStep3: 'Toggle on Allow network egress.',
      wizardClaudeCoworkGuideStep4: 'Go back to the Cowork landing page (chat view).',
      wizardClaudeCoworkGuideStep5: 'Click plus sign (+) -> Plugins -> Add Plugin.',
      wizardClaudeCoworkGuideStep6: 'Go to Personal tab.',
      wizardClaudeCoworkGuideStep7: 'Click plus sign (+) -> Add marketplace from GitHub.',
      wizardClaudeCoworkGuideStep8:
        'Paste https://github.com/familiar-software/familiar-claude-cowork-skill.',
      wizardClaudeCoworkGuideStep9: 'Click Sync.',
      wizardClaudeCoworkGuideStep10: 'Open the added marketplace and install the Familiar skill.',
      wizardClaudeCoworkGuideStep11:
        'Go back to the Cowork landing page and choose a work folder that contains Familiar context.',
      wizardClaudeCoworkGuideStep12: 'Start a new Cowork session and invoke /familiar ....',
      wizardClaudeCoworkGuideCopyLink: 'Copy Link',
      wizardClaudeCoworkGuideDone: 'Done',
      wizardAllSetTitle: "You're all set",
      wizardAllSetDescription:
        'Your context folder and capturing preferences are configured, and the skill install completed.',
      wizardFaqTitle: 'FAQ',
      wizardFaqScrollHint: 'Scroll down to see all FAQs',
      wizardFaqQuestionSensitiveData: 'Will it capture passwords or embarrassing searches?',
      wizardFaqAnswerSensitiveData:
        'Passwords & API keys are skipped from clipboard.\nCommon patterns of passwords, api keys and payment methods are scanned for each screenshot and are either redacted or completely dropped.',
      wizardFaqQuestionLeavesComputer: 'Does anything leave my computer?',
      wizardFaqAnswerLeavesComputer:
        'You control your data. Familiar does NOT share any information.',
      wizardFaqQuestionStorage: 'How much space does it take?',
      wizardFaqAnswerStorage:
        'Overtime storage will grow to no more than 3GB. Familias has cleanup mechanisms built in, and is designed to generate information of months with minimal bloat.',
      wizardFaqQuestionPerformance: 'Will it slow down my Mac or battery?',
      wizardFaqAnswerPerformance:
        "There is some overhead (periodic screenshots + OCR), but there shouldn't be any noticeable impact on modern day macs.",
      wizardFaqQuestionPauseIdle: 'Can I pause it / does it stop when I’m idle?',
      wizardFaqAnswerPauseIdle:
        'Yes. You can pause capture manually, and Familiar is designed to capture only while you’re actively using your computer (not while idle).',
      wizardFaqQuestionAudio: 'Does it record meetings/audio?',
      wizardFaqAnswerAudio:
        'No. Familiar currently captures screen context and clipboard text, not microphone audio or full meeting transcripts.',
      wizardFaqQuestionScreenshotFrequency: 'How often does Familiar take a screenshot?',
      wizardFaqAnswerScreenshotFrequency:
        'When in "Low Power Mode", every 15 seconds. Otherwise, every 5 seconds.',
      wizardBack: 'Back',
      wizardNext: 'Next',
      wizardDone: 'Done'
    },
    sections: {
      wizard: {
        title: 'Setup Wizard',
        subtitle: 'Guided setup in four steps.'
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
        failedToOpenFolderPicker: 'Failed to open folder picker.',
        failedToMoveContextFolder: 'Failed to move context folder.',
        logCopyUnavailableRestart: 'Log copy unavailable. Restart the app.',
        failedToCopyLogFile: 'Failed to copy log file.',
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
      disabledLabel: 'Capture disabled'
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
        installedAndAdditionalFailureTemplate: 'Installed for {{succeededHarnesses}}. {{message}}',
        openedClaudeCoworkGuideCombinedTemplate: '{{status}} Opened Claude Cowork guide.'
      }
    },
    claudeCoworkGuide: {
      marketplaceLinkCopied: 'Marketplace link copied.',
      failedToCopyLink: 'Failed to copy link.'
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
