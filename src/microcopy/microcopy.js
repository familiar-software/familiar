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
      clickToPauseFor10Min: 'Click to pause for 10 min',
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
    html: {
      pageTitle: 'Familiar Settings',
      brandName: 'Familiar',
      sidebarAriaLabelSettingsSections: 'Settings Sections',
      sidebarRecordingAriaLabelToggleCapturing: 'Toggle capturing',
      sidebarRecordingAriaLabelPauseOrResumeCapturing: 'Pause or resume capturing',
      sidebarRecordingActionPauseFor10Min: 'Pause (10 min)',
      navWizard: 'Wizard',
      navStorage: 'Storage',
      navCapturing: 'Capturing',
      navInstallSkill: 'Install Skill',
      updatesCheckForUpdates: 'Check for Updates',
      recordingAriaLabelCapturingSettings: 'Capturing settings',
      recordingPermissionsLabel: 'Permissions',
      recordingCheckPermissions: 'Check Permissions',
      recordingEnableFamiliarInScreenRecording: 'Enable Familiar In Screen Recording',
      recordingAfterEnablingRestartFamiliar: 'After enabling capturing, restart Familiar',
      recordingCaptureWhileActive: 'Capture While Active',
      recordingProcessingTitle: 'Processing',
      recordingProcessingSubtitle: 'Review and manage capturing',
      recordingProcessingModeLocal: 'Local',
      recordingProcessingModeCloud: 'Cloud',
      recordingLlmDescription: 'Sends still images directly from your Mac to your configured provider for extraction.',
      recordingAiProvider: 'AI Provider',
      recordingSelectProvider: 'Select provider...',
      recordingProviderGemini: 'Gemini',
      recordingProviderOpenAi: 'OpenAI',
      recordingProviderAnthropic: 'Anthropic',
      recordingApiKey: 'API Key',
      recordingApiKeyPlaceholderNotSet: 'Not set',
      recordingLocalDescription: "Apple's OCR. Local only. No API key required.",
      recordingCopyDebugLog: 'Copy Debug Log',
      recordingCopyDebugLogTitle: 'Copies ~/.familiar/logs/familiar.log to your clipboard',
      storageAriaLabelStorageSettings: 'Storage settings',
      storageContextFolder: 'Context Folder',
      storageContextFolderPlaceholderNoFolderSelected: 'No folder selected',
      storageContextFolderChange: 'Change',
      storageOpenInFinder: 'Open in Finder',
      storageUsageBreakdown: 'Usage Breakdown',
      storageUsageComputing: '(Computing)',
      storageUsageCalculating: 'Calculating...',
      storageUsageTotalZero: 'Total: 0 B',
      storageUsageLabelScreenshots: 'Screenshots',
      storageUsageLabelMarkdown: 'Markdown',
      storageUsageLabelSystem: 'System',
      storageDangerZone: 'Danger Zone',
      storageDeleteRecentFilesTitle: 'Delete recent files',
      storageDeleteRecentFilesDescription:
        'Oops, forgot to turn off recording?\nDelete all collected information in the selected time window',
      storageDeleteWindow15m: '15 minutes',
      storageDeleteWindow1h: '1 hour',
      storageDeleteWindow1d: '1 day',
      storageDeleteWindow7d: '7 days',
      storageDeleteWindowAll: 'all time',
      storageDeleteFiles: 'Delete files',
      storageImagesRetentionTitle: 'Images retention',
      storageImagesRetentionDescription: 'Maximum number of days to keep images (markdown files are NOT deleted)',
      storageRetention2d: '2 days',
      storageRetention7d: '7 days',
      installSkillAriaLabelInstallSkillSettings: 'Install skill settings',
      wizardAriaLabelSetupWizard: 'Setup wizard',
      wizardHeaderTitle: 'Setup Wizard',
      wizardHeaderSubtitle: 'Guided setup in four steps.',
      wizardHeaderComplete: 'Setup complete',
      wizardStepContext: 'Context',
      wizardStepPermissions: 'Permissions',
      wizardStepInstallSkill: 'Install Skill',
      wizardStepComplete: 'Complete',
      wizardChooseContextFolderTitle: 'Choose your context folder',
      wizardChooseContextFolderDescription:
        'Familiar stores everything inside <Context Folder>/familiar/.',
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
      wizardInstallSkillTitle: 'Install the Familiar skill',
      wizardInstallSkillDescription: "Pick where to install Familiar's skill",
      wizardHarnessClaudeCode: 'Claude Code',
      wizardHarnessCloudCowork: 'Claude Cowork',
      wizardHarnessCodex: 'Codex',
      wizardHarnessAntigravity: 'Antigravity',
      wizardHarnessCursor: 'Cursor',
      wizardCursorRestartNote: 'Restart Cursor for the skill to take effect.',
      wizardInstallSkillButton: 'Install Skill',
      wizardCloudCoworkGuideTitle: 'Claude Cowork install guide',
      wizardCloudCoworkGuideSubtitle: 'Use marketplace installation in Cowork.',
      wizardCloudCoworkGuideStep1: 'In Cowork, click on + -> Plugins -> Add Plugin.',
      wizardCloudCoworkGuideStep2: 'Go to Personal tab.',
      wizardCloudCoworkGuideStep3: 'Choose Add marketplace from Github.',
      wizardCloudCoworkGuideStep4: 'Paste https://github.com/familiar-software/familiar-claude-cowork-skill.',
      wizardCloudCoworkGuideStep5: 'Go into the marketplace installed.',
      wizardCloudCoworkGuideStep6: 'Install the Familiar skill.',
      wizardCloudCoworkGuideCopyLink: 'Copy Link',
      wizardCloudCoworkGuideDone: 'Done',
      wizardAllSetTitle: "You're all set",
      wizardAllSetDescription:
        'Your context folder and capturing preferences are configured, and the skill install completed.',
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
        title: 'Capturing',
        subtitle: 'Choose whether processing runs in the cloud or locally.'
      },
      storage: {
        title: 'Storage',
        subtitle: 'Review and manage local Familiar storage.'
      },
      installSkill: {
        title: 'Install Skill',
        subtitle: 'Install Familiar into your coding assistant skills folder.'
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
      moduleUnavailableRestart: 'Settings module unavailable. Restart the app.',
      statusSaving: 'Saving...',
      statusSaved: 'Saved.',
      statusOpeningFolderPicker: 'Opening folder picker...',
      statusCopying: 'Copying...',
      statusCopied: 'Copied.',
      errors: {
        failedToSaveSettings: 'Failed to save settings.',
        failedToSaveSetting: 'Failed to save setting.',
        failedToSaveLlmKey: 'Failed to save LLM key.',
        failedToSaveLlmProvider: 'Failed to save LLM provider.',
        failedToSaveStillsMarkdownExtractor: 'Failed to save setting.',
        failedToLoadSettings: 'Failed to load settings.',
        selectLlmProvider: 'Select an LLM provider.',
        bridgeUnavailableRestart: 'Settings bridge unavailable. Restart the app.',
        failedToOpenFolderPicker: 'Failed to open folder picker.',
        logCopyUnavailableRestart: 'Log copy unavailable. Restart the app.',
        failedToCopyLogFile: 'Failed to copy log file.',
        storageCleanupUnavailableRestart: 'Storage cleanup unavailable. Restart the app.',
        failedToDeleteFiles: 'Failed to delete files.'
      },
      deletedFiles: 'Deleted files.',
      confirmAutoCleanupRetentionTemplate:
        'Change auto cleanup retention to {{retentionDays}} days?\n\nThis will run cleanup using the new retention setting.'
    },
    updates: {
      statusCheckingForUpdates: 'Checking for updates...',
      statusAlreadyCheckingForUpdates: 'Already checking for updates...',
      statusNoUpdatesFound: 'No updates found.',
      statusUpdateAvailableTemplate: 'Update available: {{currentVersion}} -> {{version}}. You will be prompted to download.',
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
    wizardSkill: {
      harnessNames: {
        claude: 'Claude Code',
        codex: 'Codex',
        antigravity: 'Antigravity',
        cursor: 'Cursor',
        cloudCowork: 'Claude Cowork'
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
        cloudCoworkGuideUnavailableRestart: 'Claude Cowork guide unavailable. Restart the app.',
        failedToOpenCloudCoworkGuide: 'Failed to open Claude Cowork guide.',
        installing: 'Installing...',
        openedCloudCoworkGuide: 'Opened Claude Cowork guide.',
        failedToInstallSkill: 'Failed to install skill.',
        installedAndFailedTemplate: 'Installed for {{succeededHarnesses}}. Failed for {{failedHarnesses}}: {{message}}',
        installedAndAdditionalFailureTemplate: 'Installed for {{succeededHarnesses}}. {{message}}',
        openedCloudCoworkGuideCombinedTemplate: '{{status}} Opened Claude Cowork guide.'
      }
    },
    cloudCoworkGuide: {
      marketplaceLinkCopied: 'Marketplace link copied.',
      failedToCopyLink: 'Failed to copy link.'
    },
    storageUsage: {
      totalPrefix: 'Total:',
      errors: {
        unavailableRestart: 'Storage usage unavailable. Restart the app.',
        failedToLoad: 'Failed to load storage usage.'
      }
    }
  }
}

const api = { microcopy }

if (typeof module !== "undefined" && module.exports) {
  module.exports = api
}
