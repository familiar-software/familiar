export const buildDashboardShellMicrocopy = (microcopy = {}) => ({
  app: microcopy.app || {},
  dashboard: {
    ...(microcopy.dashboard || {}),
    html: {
      ...(microcopy.dashboard?.html || {}),
      appName:
        microcopy.dashboard?.html?.appName ||
        microcopy.dashboard?.html?.brandName ||
        microcopy.app?.name
    },
    recordingIndicator: {
      ...(microcopy.recordingIndicator || {}),
      ...(microcopy.dashboard?.recordingIndicator || {})
    },
    settings: {
      ...(microcopy.dashboard?.settings || {})
    },
    settingsActions: {
      ...(microcopy.dashboard?.settingsActions || {})
    },
    actions: {
      ...(microcopy.dashboard?.actions || {})
    },
    recording: {
      ...(microcopy.dashboard?.recording || {})
    },
    updates: {
      ...(microcopy.dashboard?.updates || {})
    },
    stills: {
      ...(microcopy.dashboard?.stills || {})
    },
    wizard: {
      ...(microcopy.dashboard?.wizard || {})
    },
    wizardSkill: {
      ...(microcopy.dashboard?.wizardSkill || {}),
      messages: {
        ...(microcopy.dashboard?.wizardSkill?.messages || {})
      },
      harnessNames: {
        ...(microcopy.dashboard?.wizardSkill?.harnessNames || {})
      }
    },
    storageUsage: {
      ...(microcopy.dashboard?.storageUsage || {})
    },
    heartbeats: {
      ...(microcopy.dashboard?.heartbeats || {}),
      messages: {
        ...(microcopy.dashboard?.heartbeats?.messages || {}),
        statusSaving: microcopy.dashboard?.settings?.statusSaving || 'Saving…',
        statusSaved: microcopy.dashboard?.settings?.statusSaved || 'Saved.',
        failedToSave: 'Failed to save heartbeat.',
        noTopic: 'Topic is required and must match letters, numbers, underscore, or hyphen.',
        noPrompt: 'Prompt is required.',
        noTime: 'Time is required.',
        invalidTime: 'Time must be HH:mm.',
        invalidTimezone: 'Please select a valid timezone.',
        runnerNotConfigured: 'Only allowed for options picked in "Connect Agent".'
      },
      errors: {
        ...(microcopy.dashboard?.heartbeats?.errors || {}),
        requiredContextFolder: 'Set a context folder before running or opening heartbeats.',
        failedToOpenFolder: 'Failed to open heartbeats folder.',
        failedToRunNow: 'Failed to run heartbeat.'
      }
    },
    sections: {
      ...(microcopy.dashboard?.sections || {})
    }
  },
  general: {
    ...(microcopy.general || {})
  }
})
