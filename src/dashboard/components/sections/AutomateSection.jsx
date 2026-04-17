import React, { useCallback } from 'react'

import { AutomatePromptBuilder } from '../skills/AutomatePromptBuilder'
import { AutomatePreviewThumbnail } from '../skills/AutomatePreviewThumbnail'

export function AutomateSection({
  mc,
  wizardHarnessOptions,
  skillInstallPaths,
  toDisplayText
}) {
  const html = mc?.dashboard?.html || {}

  const copyToClipboard = useCallback(async (text, setCopied) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silent — user can select manually */ }
  }, [])

  return (
    <section className="react-automate-tab max-w-[520px] space-y-3">
      <AutomatePromptBuilder
        titleVariant="settings"
        wizardHarnessOptions={wizardHarnessOptions}
        skillInstallPaths={skillInstallPaths}
        html={html}
        toDisplayText={toDisplayText}
        copyToClipboard={copyToClipboard}
        promptAside={<AutomatePreviewThumbnail />}
      />
    </section>
  )
}
