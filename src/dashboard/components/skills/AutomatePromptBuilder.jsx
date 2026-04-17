import React, { useEffect, useState } from 'react'
import { CardTitle } from '../ui/card'

// Shared prompt-builder used by the wizard's step 5 and the settings
// Automate section. State is transient — each mount starts with no
// destinations selected. The feature is a prompt generator, not an
// "automation" record: users pick destinations, copy the generated
// /familiar command, and paste it into their agent's scheduled-task UI.
export function AutomatePromptBuilder({
  wizardHarnessOptions,
  skillInstallPaths,
  html,
  toDisplayText,
  titleVariant = 'wizard',
  onSelectionChange,
  copyToClipboard,
  promptAside
}) {
  const [selectedDestinations, setSelectedDestinations] = useState(() => new Set())
  const [knowledgeBasePath, setKnowledgeBasePath] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)

  const hasAutomationDest = ['memory', 'skills', 'knowledgeBase'].some(
    (d) => selectedDestinations.has(d)
  )
  const hasSelectedDestination = selectedDestinations.size > 0

  useEffect(() => {
    if (typeof onSelectionChange === 'function') {
      onSelectionChange(hasSelectedDestination)
    }
  }, [hasSelectedDestination, onSelectionChange])

  const installedInstallModeEntries = (wizardHarnessOptions || []).filter(
    (entry) =>
      (!entry.mode || entry.mode === 'install') &&
      skillInstallPaths &&
      skillInstallPaths[entry.value]
  )
  const singleInstalledAgentName =
    installedInstallModeEntries.length === 1
      ? toDisplayText(installedInstallModeEntries[0].label)
      : null

  const toggleDestination = async (dest) => {
    if (dest === 'knowledgeBase' && !selectedDestinations.has('knowledgeBase')) {
      if (typeof window.familiar?.pickDirectory === 'function') {
        const result = await window.familiar.pickDirectory()
        if (!result?.canceled && result?.path) {
          setKnowledgeBasePath(result.path)
          setSelectedDestinations((prev) => {
            const next = new Set(prev)
            next.add('knowledgeBase')
            return next
          })
        }
        return
      }
    }
    setSelectedDestinations((prev) => {
      const next = new Set(prev)
      if (next.has(dest)) next.delete(dest)
      else next.add(dest)
      return next
    })
  }

  const generatePrompt = () => {
    const parts = []
    if (selectedDestinations.has('memory')) parts.push('native agent memory')
    if (selectedDestinations.has('skills')) parts.push('custom skills I created for myself')
    if (selectedDestinations.has('knowledgeBase')) {
      parts.push(`my personal knowledge base at \`${knowledgeBasePath || '[path]'}\``)
    }
    if (parts.length === 0) return ''
    const joined =
      parts.length === 1
        ? parts[0]
        : parts.length === 2
          ? `${parts[0]} and ${parts[1]}`
          : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
    return `Please use /familiar to update ${joined}. Keep a pointer in each memory entry back to the original markdown paths so raw data remains retrievable.`
  }

  const titleText =
    titleVariant === 'wizard' && singleInstalledAgentName
      ? `What should ${singleInstalledAgentName} auto-update with Familiar's context?`
      : titleVariant === 'settings' && html.settingsAutomateTitle
        ? toDisplayText(html.settingsAutomateTitle)
        : toDisplayText(html.wizardAutomateTitle)

  const scheduledTaskUrls = {
    cursor: 'https://cursor.com/docs/cloud-agent/automations',
    claude: 'https://code.claude.com/docs/en/routines',
    codex: 'https://developers.openai.com/codex/app/automations'
  }
  const installedHarnesses = (wizardHarnessOptions || []).filter(
    (entry) => skillInstallPaths && skillInstallPaths[entry.value]
  )
  const harnessPool = installedHarnesses.length > 0 ? installedHarnesses : (wizardHarnessOptions || [])
  const firstWithUrl = harnessPool.find((entry) => scheduledTaskUrls[entry.value])
  const scheduledTaskUrl = firstWithUrl ? scheduledTaskUrls[firstWithUrl.value] : null

  return (
    <>
      <div className="text-center">
        <CardTitle>{titleText}</CardTitle>
      </div>
      <section className="space-y-3">
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {[
            { key: 'memory', icon: '\u{1F4BE}', label: html.wizardDestMemory },
            { key: 'skills', icon: '\u{1F527}', label: html.wizardDestSkills },
            { key: 'knowledgeBase', icon: '\u{1F4C1}', label: html.wizardDestKnowledgeBase },
            { key: 'manual', icon: '\u{1F50D}', label: html.wizardDestManual }
          ].map((dest) => {
            const isChecked = selectedDestinations.has(dest.key)
            return (
              <li key={dest.key}>
                <button
                  type="button"
                  className="destination-row w-full flex items-center gap-3 px-4 py-2.5 text-left bg-white dark:bg-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                  onClick={() => void toggleDestination(dest.key)}
                >
                  <span className="text-[16px] shrink-0" aria-hidden="true">
                    {dest.icon}
                  </span>
                  <span className="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100">
                    {toDisplayText(dest.label)}
                  </span>
                  <span
                    className={`shrink-0 flex items-center justify-center w-5 h-5 rounded border-2 transition-colors ${
                      isChecked
                        ? 'border-indigo-600 bg-indigo-600'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}
                  >
                    {isChecked && (
                      <svg
                        viewBox="0 0 16 16"
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 8.5l3.5 3.5L13 5" />
                      </svg>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {hasAutomationDest && (
          <div className="space-y-2 pt-4">
            <CardTitle>
              {'Then, paste this as a '}
              {scheduledTaskUrl ? (
                <a
                  href={scheduledTaskUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  scheduled task
                </a>
              ) : (
                <span>scheduled task</span>
              )}
              {singleInstalledAgentName ? ` in ${singleInstalledAgentName}:` : ' in your agent:'}
            </CardTitle>
            <div className={promptAside ? 'flex items-stretch gap-3' : ''}>
              <div className={`prompt-box relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 pr-20 overflow-hidden ${
                promptAside ? 'flex-1 h-[110px]' : 'max-h-[4.5em]'
              }`}>
                <p className="text-[13px] text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {generatePrompt()}
                </p>
                <div className="prompt-fade absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-zinc-50 dark:from-zinc-900 to-transparent pointer-events-none" />
                <button
                  type="button"
                  className="copy-button absolute right-2 top-2 px-2.5 py-1 text-[12px] font-medium rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer z-10"
                  onClick={() => copyToClipboard(generatePrompt(), setPromptCopied)}
                >
                  {promptCopied
                    ? toDisplayText(html.wizardAutomateCopied)
                    : toDisplayText(html.wizardAutomateCopy)}
                </button>
              </div>
              {promptAside && (
                <div className="flex-1 h-[110px]">{promptAside}</div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  )
}
