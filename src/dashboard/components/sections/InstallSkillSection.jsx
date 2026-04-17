import React from 'react'

import { isInstallMode } from '../dashboard/dashboardConstants'
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
  // Settings renders install-mode rows only — copy-paste (Cowork, Any
  // local agent) is onboarding-only because its flow is "paste into
  // your agent right now" rather than configure-and-forget.
  const options = (wizardHarnessOptions || []).filter(isInstallMode)

  return (
    <section className="react-install-tab space-y-3">
      <AgentInstallerList
        options={options}
        skillInstallPaths={skillInstallPaths}
        installAgent={installAgent}
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
