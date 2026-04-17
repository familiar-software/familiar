import React, { useState } from 'react'

// Harnesses that don't hot-reload newly-installed skills — the wizard
// shows a "restart confirmed?" gate for any of these that were just
// installed. Settings doesn't gate on this; it just surfaces the
// "Installed, needs restart" row status.
export const RESTART_REQUIRED_HARNESSES = new Set(['cursor'])

// Robot glyph for the "Any local agent" row. Hoisted out so the SVG
// VNode isn't re-allocated on every render.
const LOCAL_AGENT_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-full h-full text-zinc-500 dark:text-zinc-400"
  >
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </svg>
)

// Returns JSX (not a string path) so we can inline an SVG for harnesses
// without a bundled icon asset (e.g. "Any local agent"). Cowork reuses
// the Claude Code icon — same brand family, no separate asset needed.
function defaultIconForHarness(harness) {
  switch (harness) {
    case 'claude':
    case 'cowork':
      return <img src="./assets/skill-icons/claude-code.svg" alt="" />
    case 'codex':
      return <img src="./assets/skill-icons/codex.svg" alt="" />
    case 'cursor':
      return <img src="./assets/skill-icons/cursor.svg" alt="" />
    case 'localAgent':
      return LOCAL_AGENT_ICON
    default:
      return null
  }
}

function defaultLabelForHarness(html, toDisplayText, harness) {
  switch (harness) {
    case 'claude': return toDisplayText(html.wizardHarnessClaudeCode)
    case 'cowork': return toDisplayText(html.wizardHarnessClaudeCowork)
    case 'codex': return toDisplayText(html.wizardHarnessCodex)
    case 'cursor': return toDisplayText(html.wizardHarnessCursor)
    case 'localAgent': return toDisplayText(html.wizardHarnessAnyLocalAgent)
    default: return harness
  }
}

export function computeInstalledRestartRequired(options, skillInstallPaths) {
  if (!Array.isArray(options) || !skillInstallPaths) return []
  return options
    .filter((entry) => skillInstallPaths[entry.value])
    .map((entry) => entry.value)
    .filter((value) => RESTART_REQUIRED_HARNESSES.has(value))
}

// Shared agents-list UI used in both wizard step 3 and the standalone
// Skill settings section. Owns transient per-row UI state (installing
// spinners, copy-paste expansion, per-row errors). Gating state
// (`restartConfirmed`) lives in the parent when the parent needs to
// observe it (the wizard's Next button), and is no-op'd in settings
// mode via `showRestartBanner={false}`.
export function AgentInstallerList({
  options,
  skillInstallPaths,
  installAgent,
  copyToClipboard,
  html,
  toDisplayText,
  labelForHarness,
  iconForHarness,
  showRestartBanner = false,
  installedRestartRequired = [],
  restartConfirmed,
  onRestartConfirmedChange
}) {
  const resolveLabel = labelForHarness
    || ((harness) => defaultLabelForHarness(html, toDisplayText, harness))
  const resolveIcon = iconForHarness || defaultIconForHarness

  const [installingAgents, setInstallingAgents] = useState(() => new Set())
  const [agentErrors, setAgentErrors] = useState({})
  const [expandedCopyPaste, setExpandedCopyPaste] = useState(() => new Set())
  const [copiedCopyPaste, setCopiedCopyPaste] = useState(() => new Set())

  const handleAgentClick = async (harness) => {
    if (!harness || typeof installAgent !== 'function') return
    if (skillInstallPaths && skillInstallPaths[harness]) return
    if (installingAgents.has(harness)) return
    setInstallingAgents((prev) => {
      const next = new Set(prev)
      next.add(harness)
      return next
    })
    setAgentErrors((prev) => {
      if (!prev[harness]) return prev
      const { [harness]: _removed, ...rest } = prev
      return rest
    })
    try {
      const result = await installAgent(harness)
      if (!result?.ok) {
        setAgentErrors((prev) => ({
          ...prev,
          [harness]: result?.message || 'Install failed'
        }))
      }
    } finally {
      setInstallingAgents((prev) => {
        const next = new Set(prev)
        next.delete(harness)
        return next
      })
    }
  }

  const allRestartsConfirmed =
    showRestartBanner &&
    restartConfirmed &&
    installedRestartRequired.every((value) => restartConfirmed.has(value))

  // Restart banner lives ABOVE the agent list so it's not hidden below
  // the fold on short wizard panes. Gating Next on an off-screen
  // checkbox caused real confusion; surfacing it at the top keeps the
  // required action in view.
  const restartBanner = (showRestartBanner && installedRestartRequired.length > 0) ? (() => {
    const names = installedRestartRequired.map((value) => toDisplayText(resolveLabel(value)))
    const nameNodes = []
    names.forEach((name, idx) => {
      if (idx > 0) {
        if (names.length === 2) {
          nameNodes.push(' and ')
        } else if (idx === names.length - 1) {
          nameNodes.push(', and ')
        } else {
          nameNodes.push(', ')
        }
      }
      nameNodes.push(
        <span key={`name-${name}`} className="font-semibold text-zinc-800 dark:text-zinc-100">
          {name}
        </span>
      )
    })
    const template = toDisplayText(html.wizardRestartConfirmTemplate)
    const [before, after] = template.split('{{names}}')
    return (
      <label className="mb-3 flex items-start gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 cursor-pointer select-none">
        <input
          type="checkbox"
          data-restart-confirm-banner
          checked={Boolean(allRestartsConfirmed)}
          onChange={(e) => {
            if (typeof onRestartConfirmedChange !== 'function') return
            const checked = e.target.checked
            onRestartConfirmedChange((prev) => {
              const next = new Set(prev)
              installedRestartRequired.forEach((value) => {
                if (checked) next.add(value)
                else next.delete(value)
              })
              return next
            })
          }}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
        />
        <span className="pinky-swear-label text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
          {before}
          {nameNodes}
          {after}
        </span>
      </label>
    )
  })() : null

  return (
    <>
      {restartBanner}
      <ul className="agent-list divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {options.map((entry) => {
          const harness = entry.value
          const isCopyPaste = entry.mode === 'copy-paste'
          const isInstalled = Boolean(skillInstallPaths && skillInstallPaths[harness])
          const isInstalling = installingAgents.has(harness)
          const hasError = Boolean(agentErrors[harness])
          const isCopied = copiedCopyPaste.has(harness)
          const isExpanded = expandedCopyPaste.has(harness)
          const needsRestartPrompt =
            showRestartBanner &&
            isInstalled &&
            RESTART_REQUIRED_HARNESSES.has(harness) &&
            !(restartConfirmed && restartConfirmed.has(harness))
          let statusText
          let statusClass
          if (isCopyPaste) {
            if (isCopied) {
              statusText = toDisplayText(html.wizardCopyPasteCopied)
              statusClass = 'text-emerald-600 dark:text-emerald-400'
            } else {
              // Reuse the same idle "Install" hover label as auto-install
              // rows — reads consistently regardless of underlying mechanism.
              statusText = toDisplayText(html.wizardAgentInstall)
              statusClass = 'text-zinc-500 dark:text-zinc-400 agent-row-status-idle'
            }
          } else {
            statusText = isInstalling
              ? toDisplayText(html.wizardAgentInstalling)
              : needsRestartPrompt
                ? toDisplayText(html.wizardAgentInstalledNeedsRestart)
                : isInstalled
                  ? toDisplayText(html.wizardAgentInstalled)
                  : hasError
                    ? toDisplayText(html.wizardAgentRetry)
                    : toDisplayText(html.wizardAgentInstall)
            statusClass = isInstalled
              ? 'text-emerald-600 dark:text-emerald-400'
              : hasError
                ? 'text-red-600 dark:text-red-400'
                : isInstalling
                  ? 'text-zinc-500 dark:text-zinc-400'
                  // Idle "Install →" only appears on row hover/focus
                  // (class defined in input.css — more reliable than
                  // fighting Tailwind v4 group-hover detection).
                  : 'text-zinc-500 dark:text-zinc-400 agent-row-status-idle'
          }
          const handleRowClick = () => {
            if (isCopyPaste) {
              setExpandedCopyPaste((prev) => {
                const next = new Set(prev)
                if (next.has(harness)) next.delete(harness)
                else next.add(harness)
                return next
              })
            } else {
              void handleAgentClick(harness)
            }
          }
          const promptText = toDisplayText(html.wizardSkillInstallPrompt)
          const handleCopyClick = () => {
            if (typeof copyToClipboard === 'function') {
              copyToClipboard(promptText, () => {})
            }
            setCopiedCopyPaste((prev) => {
              if (prev.has(harness)) return prev
              const next = new Set(prev)
              next.add(harness)
              return next
            })
          }
          return (
            <li key={harness}>
              <button
                type="button"
                data-skill-harness={harness}
                data-mode={entry.mode || 'install'}
                data-installed={isInstalled ? 'true' : 'false'}
                data-installing={isInstalling ? 'true' : 'false'}
                data-copied={isCopied ? 'true' : 'false'}
                data-expanded={isExpanded ? 'true' : 'false'}
                onClick={handleRowClick}
                disabled={!isCopyPaste && (isInstalled || isInstalling)}
                aria-busy={!isCopyPaste && isInstalling}
                aria-expanded={isCopyPaste ? isExpanded : undefined}
                className="agent-row w-full flex items-center gap-3 px-4 py-3 text-left bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:hover:bg-white disabled:dark:hover:bg-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                <span className="skill-picker-icon" aria-hidden="true">
                  {resolveIcon(harness)}
                </span>
                <span className="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100">
                  {resolveLabel(harness)}
                </span>
                <span
                  className={`${statusClass} text-[13px] flex items-center gap-1.5`}
                  aria-live="polite"
                  title={hasError ? agentErrors[harness] : undefined}
                >
                  {isInstalling && (
                    <span
                      className="inline-block w-3 h-3 rounded-full border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-500 dark:border-t-zinc-300 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {(isInstalled || isCopied) && (
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 8.5l3.5 3.5L13 5" />
                    </svg>
                  )}
                  {statusText}
                </span>
              </button>
              {isCopyPaste && isExpanded && (
                <div
                  className="copy-paste-expansion px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 space-y-2"
                  data-copy-paste-expansion={harness}
                >
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {harness === 'cowork'
                      ? toDisplayText(html.wizardCopyPasteIntroCowork)
                      : toDisplayText(html.wizardCopyPasteIntroLocalAgent)}
                  </p>
                  <div className="relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
                    <code className="block text-[12px] font-mono text-zinc-700 dark:text-zinc-300 whitespace-nowrap overflow-hidden px-3 py-2 pr-12">
                      {promptText}
                    </code>
                    <div className="pointer-events-none absolute top-0 bottom-0 right-0 w-20 bg-gradient-to-l from-white dark:from-zinc-950 to-transparent" />
                    <button
                      type="button"
                      onClick={handleCopyClick}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded bg-white dark:bg-zinc-950 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                      aria-label="Copy install prompt"
                      data-copy-paste-copy={harness}
                    >
                      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="5" y="5" width="9" height="9" rx="1.5" />
                        <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
