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
    sections: {
      ...(microcopy.dashboard?.sections || {})
    }
  },
  general: {
    ...(microcopy.general || {})
  }
})
