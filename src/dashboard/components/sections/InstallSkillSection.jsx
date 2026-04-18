import React, { useCallback } from 'react'

import { CardTitle } from '../ui/card'
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
    <section className="react-install-tab space-y-4">
      <div className="text-center space-y-1">
        <CardTitle>
          {toDisplayText(html.wizardInstallSkillTitleBefore)}
          <a
            href={toDisplayText(html.wizardReadTheSkillUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {toDisplayText(html.wizardInstallSkillTitleSkillLink)}
          </a>
        </CardTitle>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
          {toDisplayText(html.wizardInstallSkillDescription)}
        </p>
      </div>
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
