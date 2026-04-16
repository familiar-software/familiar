import React, { useState, useCallback } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { CardTitle } from '../ui/card'
import { Select } from '../ui/select'
// Accordion removed — Step 5 "Automate" replaced the FAQ

const FIRST_USECASE_GIF_PATH = './assets/familiar-first-usecase.gif'

export function WizardSection({
  mc,
  displayedContextFolderPath,
  wizardContextFolderPath,
  wizardStep,
  wizardError,
  permissionCheckState,
  settings,
  storageMessage,
  storageError,
  toDisplayText,
  isWizardStepComplete,
  goWizardBack,
  goWizardNext,
  completeWizard,
  pickContextFolder,
  checkPermissions,
  openScreenRecordingSettings,
  permissionFlowState = 'checking',
  openPermissionSettings,
  openStorageInFinder,
  wizardHarnessOptions,
  selectedHarnesses,
  skillInstallPaths,
  handleHarnessChange,
  installAgent,
  skillMessage,
  skillError,
  isSkillInstalled,
  wizardMessage,
  recordingStatus
}) {
  const html = mc.dashboard?.html || {}
  const wizardSkillMessages = mc.dashboard?.wizardSkill?.messages || {}

  const isPermissionCheckGranted = permissionCheckState === 'granted'
  const isPermissionCheckDenied = permissionCheckState === 'denied'
  const isCheckingPermissions = permissionCheckState === 'checking'
  const openScreenRecordingLabel = toDisplayText(html.wizardEnableFamiliarInScreenRecording)
  const checkPermissionsLabel = isCheckingPermissions
    ? mc.dashboard.stills.checkingPermissions
    : isPermissionCheckGranted
      ? mc.dashboard.stills.permissionsGranted
      : mc.dashboard.settingsActions.checkPermissions
  const canAdvance = isWizardStepComplete(wizardStep)
  const hasContextFolder = Boolean(wizardContextFolderPath)
  const [isContextAdvancedExpanded, setIsContextAdvancedExpanded] = useState(false)
  // Per-row install UI state for the Agents step. Kept local because it's
  // purely transient visual state — the canonical "is this harness
  // installed?" signal is skillInstallPaths[harness] from the shared hook.
  const [installingAgents, setInstallingAgents] = useState(() => new Set())
  const [agentErrors, setAgentErrors] = useState({})
  const handleAgentClick = async (harnessValue) => {
    if (!harnessValue || typeof installAgent !== 'function') return
    if (skillInstallPaths && skillInstallPaths[harnessValue]) return
    if (installingAgents.has(harnessValue)) return
    setInstallingAgents((prev) => {
      const next = new Set(prev)
      next.add(harnessValue)
      return next
    })
    setAgentErrors((prev) => {
      if (!prev[harnessValue]) return prev
      const { [harnessValue]: _removed, ...rest } = prev
      return rest
    })
    try {
      const result = await installAgent(harnessValue)
      if (!result?.ok) {
        setAgentErrors((prev) => ({
          ...prev,
          [harnessValue]: result?.message || 'Install failed'
        }))
      }
    } finally {
      setInstallingAgents((prev) => {
        const next = new Set(prev)
        next.delete(harnessValue)
        return next
      })
    }
  }
  // ── Step 3: restart-confirmation state ──
  // Cursor and Antigravity only pick up newly-installed skills after a
  // full restart. Once the user installs one of these we surface a single
  // "I solemnly swear I've restarted..." banner below the agent list and
  // gate the Next button on it being checked. Transient state — not
  // persisted, matches the pattern from steps 4 and 5.
  const RESTART_REQUIRED_HARNESSES = new Set(['cursor', 'antigravity'])
  const [restartConfirmed, setRestartConfirmed] = useState(() => new Set())

  // ── Step 4: "Try it" state ──
  const [pinkySwearChecked, setPinkySwearChecked] = useState(false)
  const [tryItCopied, setTryItCopied] = useState(false)

  // Shared clipboard copy helper (used by steps 4 and 5)
  const copyToClipboard = useCallback(async (text, setCopied) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silent fail — user can manually select and copy */ }
  }, [])

  // ── Step 5: "Automate" state ──
  const [selectedDestinations, setSelectedDestinations] = useState(() => new Set())
  const [knowledgeBasePath, setKnowledgeBasePath] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)

  const hasAutomationDest = ['memory', 'skills', 'knowledgeBase'].some(
    (d) => selectedDestinations.has(d)
  )
  const hasSelectedDestination = selectedDestinations.size > 0

  const toggleDestination = async (dest) => {
    if (dest === 'knowledgeBase' && !selectedDestinations.has('knowledgeBase')) {
      // Auto-launch folder picker when checking knowledge base
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
        // If canceled, don't check the box
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
      parts.push(
        `my personal knowledge base at \`${knowledgeBasePath || '[path]'}\``
      )
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

  // Override canAdvance for steps with local gating
  const installedHarnessValues = wizardHarnessOptions
    ? wizardHarnessOptions
        .filter((entry) => skillInstallPaths && skillInstallPaths[entry.value])
        .map((entry) => entry.value)
    : []
  const installedRestartRequired = installedHarnessValues.filter((value) =>
    RESTART_REQUIRED_HARNESSES.has(value)
  )
  const allRestartsConfirmed = installedRestartRequired.every((value) =>
    restartConfirmed.has(value)
  )
  const canAdvanceStep = wizardStep === 3
    ? allRestartsConfirmed
    : wizardStep === 4
      ? pinkySwearChecked
      : wizardStep === 5
        ? hasSelectedDestination
        : canAdvance

  const handleNext = () => {
    if (wizardStep === 3 && !allRestartsConfirmed) return
    if (wizardStep === 4 && !pinkySwearChecked) return
    goWizardNext()
  }

  const handleDone = () => {
    if (wizardStep === 5 && !hasSelectedDestination) return
    completeWizard()
  }

  const iconForHarness = (harness) => {
    switch (harness) {
      case 'claude': return './assets/skill-icons/claude-code.svg'
      case 'codex': return './assets/skill-icons/codex.svg'
      case 'antigravity': return './assets/skill-icons/antigravity.svg'
      case 'cursor': return './assets/skill-icons/cursor.svg'
      default: return ''
    }
  }
  const labelForHarness = (harness) => {
    switch (harness) {
      case 'claude': return toDisplayText(html.wizardHarnessClaudeCode)
      case 'codex': return toDisplayText(html.wizardHarnessCodex)
      case 'antigravity': return toDisplayText(html.wizardHarnessAntigravity)
      case 'cursor': return toDisplayText(html.wizardHarnessCursor)
      default: return harness
    }
  }
  // wizardContextFolderPath is already <parent>/familiar (the storage
  // dir) — see toWizardContextFolderPath in useDashboardState. Friendly
  // display abbreviates $HOME to "~". Renderer can't import node:os;
  // main process attaches homedir to the settings IPC payload.
  const homedir = typeof settings?.homedir === 'string' ? settings.homedir : ''
  const storageDirAbsolute = (wizardContextFolderPath || '').replace(/\/$/, '')
  const storageDirDisplay = (() => {
    if (!storageDirAbsolute) return ''
    if (homedir && storageDirAbsolute === homedir) return '~'
    if (homedir && storageDirAbsolute.startsWith(`${homedir}/`)) {
      return `~/${storageDirAbsolute.slice(homedir.length + 1)}`
    }
    return storageDirAbsolute
  })()

  const wizardStepLabel = (step) => ({
    1: toDisplayText(html.wizardStepPermissions),
    2: toDisplayText(html.wizardStepContext),
    3: toDisplayText(html.wizardStepInstallSkill),
    4: toDisplayText(html.wizardStepFirstUsecase),
    5: toDisplayText(html.wizardStepComplete)
  }[step] || '')

  const getCircleClassName = (step) => {
    if (wizardStep === step) {
      return 'border-indigo-600 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
    }
    if (wizardStep > step) {
      return 'border-indigo-600 bg-indigo-600 text-white'
    }
    return 'border-zinc-200 dark:border-zinc-700 text-zinc-500'
  }

  const getStepLabelClassName = (step) => {
    if (wizardStep === step) {
      return 'text-zinc-900 dark:text-zinc-100 font-semibold'
    }
    if (wizardStep > step) {
      return 'text-indigo-600 dark:text-indigo-400'
    }
    return 'text-zinc-500 dark:text-zinc-400'
  }

  return (
      <section id="section-wizard" className="relative flex-1 flex flex-col min-h-0">
      <div className="flex-none px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/40">
        <div className="flex items-center justify-between relative px-6">
          <div className="flex flex-col items-center gap-1.5 relative z-10" data-wizard-step-indicator="1">
            <div
              className={`w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-700 text-[14px] font-semibold flex items-center justify-center ${getCircleClassName(1)}`}
              data-wizard-step-circle="1"
            >
              1
            </div>
            <span
              className={`max-w-[76px] text-center leading-tight text-[14px] font-medium ${getStepLabelClassName(1)}`}
              data-wizard-step-label="1"
            >
              {wizardStepLabel(1)}
            </span>
          </div>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800 mx-2 relative">
            <div
              className="absolute inset-y-0 left-0 bg-indigo-600 transition-all"
              data-wizard-step-connector="1"
              style={{ width: wizardStep > 1 ? '100%' : '0%' }}
            />
          </div>

          <div className="flex flex-col items-center gap-1.5 relative z-10" data-wizard-step-indicator="2">
            <div
              className={`w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-700 text-[14px] font-semibold flex items-center justify-center ${getCircleClassName(2)}`}
              data-wizard-step-circle="2"
            >
              2
            </div>
            <span
              className={`max-w-[76px] text-center leading-tight text-[14px] font-medium ${getStepLabelClassName(2)}`}
              data-wizard-step-label="2"
            >
              {wizardStepLabel(2)}
            </span>
          </div>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800 mx-2 relative">
            <div
              className="absolute inset-y-0 left-0 bg-indigo-600 transition-all"
              data-wizard-step-connector="2"
              style={{ width: wizardStep > 2 ? '100%' : '0%' }}
            />
          </div>

          <div className="flex flex-col items-center gap-1.5 relative z-10" data-wizard-step-indicator="3">
            <div
              className={`w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-700 text-[14px] font-semibold flex items-center justify-center ${getCircleClassName(3)}`}
              data-wizard-step-circle="3"
            >
              3
            </div>
            <span
              className={`max-w-[76px] text-center leading-tight text-[14px] font-medium ${getStepLabelClassName(3)}`}
              data-wizard-step-label="3"
            >
              {wizardStepLabel(3)}
            </span>
          </div>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800 mx-2 relative">
            <div
              className="absolute inset-y-0 left-0 bg-indigo-600 transition-all"
              data-wizard-step-connector="3"
              style={{ width: wizardStep > 3 ? '100%' : '0%' }}
            />
          </div>

          <div className="flex flex-col items-center gap-1.5 relative z-10" data-wizard-step-indicator="4">
            <div
              className={`w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-700 text-[14px] font-semibold flex items-center justify-center ${getCircleClassName(4)}`}
              data-wizard-step-circle="4"
            >
              4
            </div>
            <span
              className={`max-w-[76px] text-center leading-tight text-[14px] font-medium ${getStepLabelClassName(4)}`}
              data-wizard-step-label="4"
            >
              {wizardStepLabel(4)}
            </span>
          </div>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800 mx-2 relative">
            <div
              className="absolute inset-y-0 left-0 bg-indigo-600 transition-all"
              data-wizard-step-connector="4"
              style={{ width: wizardStep > 4 ? '100%' : '0%' }}
            />
          </div>

          <div className="flex flex-col items-center gap-1.5 relative z-10" data-wizard-step-indicator="5">
            <div
              className={`w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-700 text-[14px] font-semibold flex items-center justify-center ${getCircleClassName(5)}`}
              data-wizard-step-circle="5"
            >
              5
            </div>
            <span
              className={`max-w-[76px] text-center leading-tight text-[14px] font-medium ${getStepLabelClassName(5)}`}
              data-wizard-step-label="5"
            >
              {wizardStepLabel(5)}
            </span>
          </div>
        </div>
      </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 scrollbar-slim">
        <div className="max-w-[520px] mx-auto space-y-5" data-wizard-step="2" hidden={wizardStep !== 2}>
          <div className="text-center space-y-1">
            <CardTitle>
              {toDisplayText(html.wizardChooseContextFolderTitle)}
            </CardTitle>
          </div>
          <section className="space-y-4" data-component-source="context-folder">
            <p
              data-role="context-folder-what"
              className="text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-300"
            >
              {toDisplayText(html.wizardContextFolderWhatBody)}
            </p>

            <div
              className="input-ring flex items-center gap-2 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg"
              data-role="storage-path-display"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-10Z" />
                </svg>
              </div>
              <Input
                id="wizard-context-folder-path"
                data-setting="context-folder-path"
                type="text"
                aria-label={toDisplayText(html.wizardContextFolder)}
                placeholder={toDisplayText(html.wizardContextFolderPlaceholderNoFolderSelected)}
                readOnly
                value={storageDirDisplay || ''}
                title={storageDirAbsolute || ''}
                className="flex-1 bg-transparent text-[14px] font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
              />
              <Button
                id="wizard-context-folder-show-in-finder"
                data-action="open-storage-in-finder"
                type="button"
                variant="outline"
                size="sm"
                className="px-2.5 py-1.5 text-[14px] font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  if (typeof openStorageInFinder === 'function') {
                    void openStorageInFinder()
                  }
                }}
                disabled={!hasContextFolder}
              >
                {toDisplayText(html.wizardContextFolderShowInFinder)}
              </Button>
            </div>

            <p
              data-role="context-folder-privacy"
              className="text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-300"
            >
              {toDisplayText(html.wizardContextFolderPrivacyBody)}
            </p>

            <p
              id="wizard-context-folder-error"
              data-setting-error="context-folder-error"
              className={`text-[14px] text-red-600 dark:text-red-400 ${toDisplayText(storageError) ? '' : 'hidden'}`}
              role="alert"
              aria-live="polite"
            >
              {toDisplayText(storageError)}
            </p>

            {!isContextAdvancedExpanded ? (
              <div className="pt-6 text-center">
                <button
                  type="button"
                  data-action="context-folder-advanced-toggle"
                  className="text-[12px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline-offset-4 hover:underline focus:outline-none cursor-pointer"
                  onClick={() => setIsContextAdvancedExpanded(true)}
                >
                  {toDisplayText(html.wizardContextFolderAdvanced)}
                </button>
              </div>
            ) : (
              <div className="mt-6 pt-4 space-y-2 border-t border-zinc-200 dark:border-zinc-800">
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  {toDisplayText(html.wizardContextFolderAdvancedNote)}
                </p>
                <Button
                  id="wizard-context-folder-choose"
                  data-action="context-folder-choose"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="px-2.5 py-1.5 text-[14px] font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                  onClick={() => {
                    void pickContextFolder(false)
                  }}
                >
                  {toDisplayText(html.wizardContextFolderChange)}
                </Button>
              </div>
            )}
          </section>
        </div>

        <div className="max-w-[360px] mx-auto space-y-5" data-wizard-step="1" hidden={wizardStep !== 1}>
          <div className="text-center space-y-1">
            <CardTitle>
              {toDisplayText(html.wizardEnableCapturingTitle)}
            </CardTitle>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
              {toDisplayText(html.wizardEnableCapturingDescription)}
            </p>
          </div>
          <div data-component-source="permissions" className="space-y-5">
            <section className="space-y-3" data-permission-flow-state={permissionFlowState}>
              {permissionFlowState === 'checking' && (
                <p className="text-[14px] text-zinc-500 dark:text-zinc-400 text-center">
                  {toDisplayText(html.wizardPermissionChecking)}
                </p>
              )}
              {permissionFlowState === 'ready' && (
                <div className="flex justify-center">
                  <Button
                    id="wizard-open-screen-recording-settings"
                    data-action="open-screen-recording-settings"
                    type="button"
                    className="px-4 py-2 text-[14px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors cursor-pointer"
                    onClick={() => {
                      if (typeof openPermissionSettings === 'function') {
                        void openPermissionSettings()
                      } else {
                        void openScreenRecordingSettings?.()
                      }
                    }}
                  >
                    {toDisplayText(html.wizardPermissionOpenSettings)}
                  </Button>
                </div>
              )}
              {(permissionFlowState === 'waiting' || permissionFlowState === 'nudge') && (
                <div className="space-y-2 text-center">
                  <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
                    {toDisplayText(html.wizardPermissionWaiting)}
                  </p>
                  <p className="text-[13px] text-zinc-400 dark:text-zinc-500">
                    {toDisplayText(
                      permissionFlowState === 'nudge'
                        ? html.wizardPermissionNudgeHint
                        : html.wizardPermissionWaitingHint
                    )}
                  </p>
                </div>
              )}
              {permissionFlowState === 'granted' && (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[14px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                  <span>{toDisplayText(html.wizardPermissionGranted)}</span>
                </div>
              )}
            </section>
            <p
              id="wizard-always-record-when-active-error"
              data-setting-error="always-record-when-active-error"
              className={`text-[14px] text-red-600 dark:text-red-400 ${toDisplayText(wizardError) ? '' : 'hidden'}`}
              role="alert"
              aria-live="polite"
            >
              {toDisplayText(wizardError)}
            </p>
            <span
              id="wizard-always-record-when-active-status"
              data-setting-status="always-record-when-active-status"
              className={`text-[14px] text-emerald-600 dark:text-emerald-400 ${toDisplayText(wizardMessage) ? '' : 'hidden'}`}
              aria-live="polite"
            >
              {toDisplayText(wizardMessage)}
            </span>
          </div>
        </div>

        <div className="max-w-[360px] mx-auto space-y-5" data-wizard-step="3" hidden={wizardStep !== 3}>
          <div className="text-center space-y-1">
            <CardTitle>
              {toDisplayText(html.wizardInstallSkillTitle)}
            </CardTitle>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
              {toDisplayText(html.wizardInstallSkillDescription)}
            </p>
          </div>
          <div data-component-source="install-skill" className="space-y-3">
            <ul className="agent-list divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {wizardHarnessOptions.map((entry) => {
                const harness = entry.value
                const isInstalled = Boolean(skillInstallPaths && skillInstallPaths[harness])
                const isInstalling = installingAgents.has(harness)
                const hasError = Boolean(agentErrors[harness])
                const needsRestartPrompt =
                  isInstalled &&
                  RESTART_REQUIRED_HARNESSES.has(harness) &&
                  !restartConfirmed.has(harness)
                const statusText = isInstalling
                  ? toDisplayText(html.wizardAgentInstalling)
                  : needsRestartPrompt
                    ? toDisplayText(html.wizardAgentInstalledNeedsRestart)
                    : isInstalled
                      ? toDisplayText(html.wizardAgentInstalled)
                      : hasError
                        ? toDisplayText(html.wizardAgentRetry)
                        : toDisplayText(html.wizardAgentInstall)
                const statusClass = isInstalled
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : hasError
                    ? 'text-red-600 dark:text-red-400'
                    : isInstalling
                      ? 'text-zinc-500 dark:text-zinc-400'
                      // Idle "Install →" only appears on row hover/focus
                      // (class defined in input.css — more reliable than
                      // fighting Tailwind v4 group-hover detection).
                      : 'text-zinc-500 dark:text-zinc-400 agent-row-status-idle'
                return (
                  <li key={harness}>
                    <button
                      type="button"
                      data-skill-harness={harness}
                      data-installed={isInstalled ? 'true' : 'false'}
                      data-installing={isInstalling ? 'true' : 'false'}
                      onClick={() => handleAgentClick(harness)}
                      disabled={isInstalled || isInstalling}
                      aria-busy={isInstalling}
                      className="agent-row w-full flex items-center gap-3 px-4 py-3 text-left bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:hover:bg-white disabled:dark:hover:bg-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                    >
                      <span className="skill-picker-icon" aria-hidden="true">
                        <img src={iconForHarness(harness)} alt="" />
                      </span>
                      <span className="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100">
                        {labelForHarness(harness)}
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
                        {isInstalled && (
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 8.5l3.5 3.5L13 5" />
                          </svg>
                        )}
                        {statusText}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {installedRestartRequired.length > 0 && (() => {
              const names = installedRestartRequired.map((value) => toDisplayText(labelForHarness(value)))
              // Build an array of nodes so each name is bold but the
              // separators (", " and " and ") stay plain weight.
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
                <label className="mt-3 flex items-start gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-restart-confirm-banner
                    checked={allRestartsConfirmed}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setRestartConfirmed((prev) => {
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
            })()}
          </div>
        </div>

        <div className="max-w-[520px] mx-auto space-y-4" data-wizard-step="4" hidden={wizardStep !== 4}>
          <div className="text-center">
            <CardTitle>
              {toDisplayText(html.wizardFirstUsecaseTitle)}
            </CardTitle>
          </div>
          <section className="space-y-3">
            <div className="relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3">
              <code className="block text-[14px] text-zinc-800 dark:text-zinc-200 pr-16 select-all">
                {toDisplayText(html.wizardFirstUsecaseCommand)}
              </code>
              <button
                type="button"
                className="copy-button absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[12px] font-medium rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                onClick={() =>
                  copyToClipboard(
                    toDisplayText(html.wizardFirstUsecaseCommand),
                    setTryItCopied
                  )
                }
              >
                {tryItCopied
                  ? toDisplayText(html.wizardAutomateCopied)
                  : toDisplayText(html.wizardAutomateCopy)}
              </button>
            </div>
            <label className="flex items-start gap-3 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={pinkySwearChecked}
                onChange={(e) => setPinkySwearChecked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="pinky-swear-label text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {toDisplayText(html.wizardTryItPinkySwear)}
              </span>
            </label>
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm max-h-[180px]">
              <img
                id="wizard-first-usecase-gif"
                src={FIRST_USECASE_GIF_PATH}
                alt={toDisplayText(html.wizardFirstUsecaseGifAlt)}
                className="block w-full h-auto"
              />
            </div>
          </section>
        </div>

        <div className="max-w-[440px] mx-auto space-y-3" data-wizard-step="5" hidden={wizardStep !== 5}>
          <div className="text-center">
            <CardTitle>
              {toDisplayText(html.wizardAutomateTitle)}
            </CardTitle>
          </div>
          <section className="space-y-3">
            {/* ── Destination picker ── */}
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
                      <span className={`shrink-0 flex items-center justify-center w-5 h-5 rounded border-2 transition-colors ${isChecked ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300 dark:border-zinc-600'}`}>
                        {isChecked && (
                          <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 8.5l3.5 3.5L13 5" />
                          </svg>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* ── Generated prompt with blur fade (visible when any automation dest is checked) ── */}
            {hasAutomationDest && (() => {
              const scheduledTaskUrls = {
                cursor: 'https://cursor.com/docs/cloud-agent/automations',
                claude: 'https://code.claude.com/docs/en/routines',
                codex: 'https://developers.openai.com/codex/app/automations'
                // antigravity: no scheduled task docs
              }
              const installedHarnesses = wizardHarnessOptions.filter(
                (entry) => skillInstallPaths && skillInstallPaths[entry.value]
              )
              const harnessPool = installedHarnesses.length > 0 ? installedHarnesses : wizardHarnessOptions
              const firstWithUrl = harnessPool.find((entry) => scheduledTaskUrls[entry.value])
              const scheduledTaskUrl = firstWithUrl ? scheduledTaskUrls[firstWithUrl.value] : null
              return (
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
                    {' in your agent:'}
                  </CardTitle>
                  <div className="prompt-box relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 pr-20 max-h-[4.5em] overflow-hidden">
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
                </div>
              )
            })()}

            {/* No manual-only note — the option label is self-explanatory */}
          </section>
        </div>
      </div>

      <div className="flex-none h-14 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/50 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/40">
        <Button
          id="wizard-back"
          type="button"
          variant="secondary"
          className="flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-medium"
          onClick={goWizardBack}
          disabled={wizardStep <= 1}
        >
          {toDisplayText(html.wizardBack)}
        </Button>
        <div className="flex items-center gap-2">
          <span
            id="wizard-step-status"
            className={`text-[14px] text-zinc-400 whitespace-nowrap ${canAdvanceStep ? 'hidden' : ''}`}
            aria-live="polite"
          >
            {toDisplayText(mc.dashboard.wizard?.completeStepToContinue)}
          </span>
          <Button
            id="wizard-next"
            type="button"
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-[14px] font-medium text-white shadow-sm shadow-indigo-200 dark:shadow-none hover:shadow-md hover:shadow-indigo-500/20 active:translate-y-px transition-all ${wizardStep >= 5 ? 'hidden' : ''}`}
            onClick={handleNext}
            disabled={wizardStep >= 5 || !canAdvanceStep}
            hidden={wizardStep >= 5}
          >
            {toDisplayText(html.wizardNext)}
          </Button>
          <Button
            id="wizard-done"
            type="button"
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-[14px] font-medium text-white shadow-sm shadow-indigo-200 dark:shadow-none hover:shadow-md hover:shadow-indigo-500/20 active:translate-y-px transition-all ${wizardStep >= 5 ? '' : 'hidden'}`}
            onClick={handleDone}
            disabled={wizardStep < 5 || !canAdvanceStep}
            hidden={wizardStep < 5}
          >
            {toDisplayText(mc.dashboard?.actions?.wizardDone)}
          </Button>
        </div>
      </div>
    </section>
  )
}
