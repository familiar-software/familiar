function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const key of Object.keys(value)) {
    deepFreeze(value[key])
  }
  return value
}

function assertNoSpaceKeys(value, parentPath = '') {
  if (!value || typeof value !== 'object') {
    return
  }

  for (const key of Object.keys(value)) {
    if (/\s/.test(key)) {
      const prefix = parentPath ? `${parentPath}.` : ''
      throw new Error(`Microcopy key contains whitespace: ${prefix}${key}`)
    }
    assertNoSpaceKeys(value[key], parentPath ? `${parentPath}.${key}` : key)
  }
}

function resolveMicrocopySource() {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.FamiliarMicrocopySource &&
    typeof globalThis.FamiliarMicrocopySource === 'object'
  ) {
    return globalThis.FamiliarMicrocopySource
  }

  if (typeof require === 'function') {
    const candidatePaths = [
      './microcopy',
      '../microcopy/microcopy'
    ]

    for (const candidatePath of candidatePaths) {
      try {
        const loaded = require(candidatePath)
        if (loaded && typeof loaded === 'object') {
          return loaded
        }
      } catch (_error) {
        // Try next candidate.
      }
    }
  }

  return null
}

const microcopySource = resolveMicrocopySource()
if (!microcopySource || !microcopySource.microcopy) {
  throw new Error('Familiar microcopy source is unavailable')
}
const microcopy = JSON.parse(JSON.stringify(microcopySource.microcopy))

function formatTemplate(template, values = {}) {
  if (typeof template !== 'string') {
    return ''
  }
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      return ''
    }
    const value = values[key]
    return value === null || value === undefined ? '' : String(value)
  })
}

function getMicrocopyValue(path) {
  if (typeof path !== 'string' || path.length === 0) {
    return null
  }
  return path.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') {
      return null
    }
    return Object.prototype.hasOwnProperty.call(current, key) ? current[key] : null
  }, microcopy)
}

const formatters = {
  autoCleanupRetentionConfirm: (retentionDays) =>
    formatTemplate(microcopy.dashboard.settings.confirmAutoCleanupRetentionTemplate, { retentionDays }),
  updateAvailable: ({ currentVersion, version }) =>
    formatTemplate(microcopy.dashboard.updates.statusUpdateAvailableTemplate, {
      currentVersion,
      version
    }),
  updateDownloading: (percent) =>
    formatTemplate(microcopy.dashboard.updates.progress.downloadingTemplate, { percent }),
  updateDownloadComplete: ({ version }) =>
    version
      ? formatTemplate(microcopy.dashboard.updates.progress.downloadCompleteWithVersionTemplate, { version })
      : microcopy.dashboard.updates.progress.downloadCompleteNoVersion,
  wizardSkillInstalledAt: (path) =>
    formatTemplate(microcopy.dashboard.wizardSkill.messages.installedAtTemplate, { path }),
  wizardSkillInstalledFor: (harnesses) =>
    formatTemplate(microcopy.dashboard.wizardSkill.messages.installedForTemplate, { harnesses }),
  wizardSkillInstalledAndFailed: ({ succeededHarnesses, failedHarnesses, message }) =>
    formatTemplate(microcopy.dashboard.wizardSkill.messages.installedAndFailedTemplate, {
      succeededHarnesses,
      failedHarnesses,
      message
    }),
  wizardSkillInstalledAndAdditionalFailure: ({ succeededHarnesses, message }) =>
    formatTemplate(microcopy.dashboard.wizardSkill.messages.installedAndAdditionalFailureTemplate, {
      succeededHarnesses,
      message
    }),
  wizardSkillOpenedCloudCoworkGuideCombined: (status) =>
    formatTemplate(microcopy.dashboard.wizardSkill.messages.openedCloudCoworkGuideCombinedTemplate, { status })
}

assertNoSpaceKeys(microcopy)
deepFreeze(microcopy)
deepFreeze(formatters)

const api = {
  microcopy,
  getMicrocopyValue,
  formatTemplate,
  formatters
}

if (typeof globalThis !== 'undefined') {
  globalThis.FamiliarMicrocopy = api
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api
}
