import React, { useCallback } from 'react'

import { AgentInstallerList } from '../skills/AgentInstallerList'

export function InstallSkillSection({
  mc,
  wizardHarnessOptions,
  skillInstallPaths,
  installAgent,
  toDisplayText,
  skillError
}) {
  const html = mc?.dashboard?.html || {}
  const options = wizardHarnessOptions || []

  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch { /* silent — user can select manually */ }
  }, [])

  return (
    <section className="react-install-tab space-y-3">
      <AgentInstallerList
        options={options}
        skillInstallPaths={skillInstallPaths}
        installAgent={installAgent}
        copyToClipboard={copyToClipboard}
        html={html}
        toDisplayText={toDisplayText}
        showRestartBanner={false}
      />
      {skillError ? (
        <p id="settings-skill-error" className="react-help-text react-help-text-error">
          {toDisplayText(skillError)}
        </p>
      ) : null}
    </section>
  )
}
