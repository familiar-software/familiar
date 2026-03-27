import React from 'react'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { CardTitle } from '../ui/card'
import { Label } from '../ui/label'
import { Select } from '../ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import { CLOUD_COWORK_GUIDE_URL } from '../dashboard/dashboardConstants'

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
  wizardHarnessOptions,
  selectedHarnesses,
  skillInstallPaths,
  handleHarnessChange,
  skillMessage,
  skillError,
  wizardClaudeCoworkGuideVisible,
  copyClaudeCoworkGuideLink,
  claudeCoworkGuideMessage,
  claudeCoworkGuideError,
  hideClaudeCoworkGuide,
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
  const skillStatusMessage = toDisplayText(skillMessage)
    || (wizardClaudeCoworkGuideVisible ? toDisplayText(claudeCoworkGuideMessage) : '')
  const canAdvance = isWizardStepComplete(wizardStep)
  const selectedSet = new Set(selectedHarnesses)
  const pathInstallText = Object.entries(skillInstallPaths || {})
    .filter(([, path]) => typeof path === 'string' && path.length > 0)
    .map(([harness, path]) => `${harness}: ${path}`)
    .join('\n')
  const displayedSkillStatus = skillStatusMessage || toDisplayText(wizardMessage)
  const hasContextFolder = Boolean(wizardContextFolderPath)

  const wizardStepLabel = (step) => ({
    1: toDisplayText(html.wizardStepContext),
    2: toDisplayText(html.wizardStepPermissions),
    3: toDisplayText(html.wizardStepInstallSkill),
    4: toDisplayText(html.wizardStepComplete)
  }[step] || '')

  const wizardClaudeCoworkGuideSteps = [
    toDisplayText(html.wizardClaudeCoworkGuideStep1),
    toDisplayText(html.wizardClaudeCoworkGuideStep2),
    toDisplayText(html.wizardClaudeCoworkGuideStep3),
    toDisplayText(html.wizardClaudeCoworkGuideStep4),
    toDisplayText(html.wizardClaudeCoworkGuideStep5),
    toDisplayText(html.wizardClaudeCoworkGuideStep6),
    toDisplayText(html.wizardClaudeCoworkGuideStep7),
    toDisplayText(html.wizardClaudeCoworkGuideStep8),
    toDisplayText(html.wizardClaudeCoworkGuideStep9),
    toDisplayText(html.wizardClaudeCoworkGuideStep10),
    toDisplayText(html.wizardClaudeCoworkGuideStep11),
    toDisplayText(html.wizardClaudeCoworkGuideStep12)
  ]

  const wizardFaq = [
    {
      question: toDisplayText(html.wizardFaqQuestionHowItWorks),
      answer: toDisplayText(html.wizardFaqAnswerHowItWorks)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionData),
      answer: toDisplayText(html.wizardFaqAnswerData)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionSensitiveData),
      answer: toDisplayText(html.wizardFaqAnswerSensitiveData)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionRetention),
      answer: toDisplayText(html.wizardFaqAnswerRetention)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionStorage),
      answer: toDisplayText(html.wizardFaqAnswerStorage)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionBattery),
      answer: toDisplayText(html.wizardFaqAnswerBattery)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionScreenshotFrequency),
      answer: toDisplayText(html.wizardFaqAnswerScreenshotFrequency)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionMonitors),
      answer: toDisplayText(html.wizardFaqAnswerMonitors)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionAgents),
      answer: toDisplayText(html.wizardFaqAnswerAgents)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionNoise),
      answer: toDisplayText(html.wizardFaqAnswerNoise)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionAudio),
      answer: toDisplayText(html.wizardFaqAnswerAudio)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionFree),
      answer: toDisplayText(html.wizardFaqAnswerFree)
    },
    {
      question: toDisplayText(html.wizardFaqQuestionWhyOwl),
      answer: toDisplayText(html.wizardFaqAnswerWhyOwl)
    },
  ]

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
        <div className="flex items-center justify-between relative">
          <div className="flex flex-col items-center gap-1.5 relative z-10" data-wizard-step-indicator="1">
            <div
              className={`w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-700 text-[14px] font-semibold flex items-center justify-center ${getCircleClassName(1)}`}
              data-wizard-step-circle="1"
            >
              1
            </div>
            <span
              className={`text-[14px] font-medium ${getStepLabelClassName(1)}`}
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
              className={`text-[14px] font-medium ${getStepLabelClassName(2)}`}
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
              className={`text-[14px] font-medium ${getStepLabelClassName(3)}`}
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
              className={`text-[14px] font-medium ${getStepLabelClassName(4)}`}
              data-wizard-step-label="4"
            >
              {wizardStepLabel(4)}
            </span>
          </div>
        </div>
      </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 scrollbar-slim">
        <div className="max-w-[520px] mx-auto space-y-5" data-wizard-step="1" hidden={wizardStep !== 1}>
          <div className="text-center space-y-1">
            <CardTitle>
              {toDisplayText(html.wizardChooseContextFolderTitle)}
            </CardTitle>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
              {toDisplayText(html.wizardChooseContextFolderDescription)}
            </p>
          </div>
          {hasContextFolder ? (
            <section className="space-y-2">
              <div className="input-ring flex items-center gap-2 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
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
                  value={wizardContextFolderPath || displayedContextFolderPath || mc.general?.unknown}
                  className="flex-1 bg-transparent text-[14px] font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
                />
                <Button
                  id="wizard-context-folder-choose"
                  data-action="context-folder-choose"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="px-2.5 py-1.5 text-[14px] font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    void pickContextFolder(false)
                  }}
                >
                  {toDisplayText(html.wizardContextFolderChange)}
                </Button>
              </div>
              <p
                id="wizard-context-folder-error"
                data-setting-error="context-folder-error"
                className={`text-[14px] text-red-600 dark:text-red-400 ${toDisplayText(storageError) ? '' : 'hidden'}`}
                role="alert"
                aria-live="polite"
              >
                {toDisplayText(storageError)}
              </p>
            </section>
          ) : (
            <section className="space-y-2">
              <Button
                id="wizard-context-folder-choose"
                data-action="context-folder-choose"
                type="button"
                variant="outline"
                className="group w-full min-h-20 h-auto rounded-[24px] border-zinc-200/90 dark:border-zinc-700 bg-zinc-50/90 dark:bg-zinc-900/90 px-5 py-4 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => {
                  void pickContextFolder(false)
                }}
              >
                <span className="grid w-full grid-cols-[48px_minmax(0,1fr)_48px] items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-indigo-200 bg-indigo-50 text-indigo-600 transition-colors group-hover:border-indigo-300 group-hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 dark:group-hover:bg-indigo-900/70">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
                      <path d="M7 12.5h10" />
                    </svg>
                  </span>
                  <span className="min-w-0 text-center">
                    <span className="block whitespace-nowrap text-[16px] leading-none tracking-tight text-zinc-900 dark:text-zinc-100">
                      {toDisplayText(html.wizardContextFolderSetCta)}
                    </span>
                  </span>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 transition-colors group-hover:border-indigo-200 group-hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500 dark:group-hover:border-indigo-700 dark:group-hover:text-indigo-300">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </span>
                </span>
              </Button>
              <p
                id="wizard-context-folder-error"
                data-setting-error="context-folder-error"
                className={`text-[14px] text-red-600 dark:text-red-400 ${toDisplayText(storageError) ? '' : 'hidden'}`}
                role="alert"
                aria-live="polite"
              >
                {toDisplayText(storageError)}
              </p>
            </section>
          )}
        </div>

        <div className="max-w-[360px] mx-auto space-y-5" data-wizard-step="2" hidden={wizardStep !== 2}>
          <div className="text-center space-y-1">
            <CardTitle>
              {toDisplayText(html.wizardEnableCapturingTitle)}
            </CardTitle>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
              {toDisplayText(html.wizardEnableCapturingDescription)}
            </p>
          </div>
          <div data-component-source="permissions" className="space-y-5">
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  id="wizard-check-permissions"
                  data-action="check-permissions"
                  type="button"
                  variant="outline"
                  className="px-3 py-2 text-[14px] font-semibold bg-transparent border border-indigo-600 hover:border-indigo-700 rounded-lg text-indigo-600 hover:text-indigo-700 focus:outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    void checkPermissions()
                  }}
                  disabled={isCheckingPermissions}
                >
                  {checkPermissionsLabel}
                </Button>
                <Button
                  id="wizard-open-screen-recording-settings"
                  data-action="open-screen-recording-settings"
                  type="button"
                  variant="outline"
                  className="px-3 py-2 text-[14px] font-semibold bg-white dark:bg-zinc-800 border border-indigo-300 dark:border-indigo-700 rounded-lg text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 focus:outline-none transition-colors cursor-pointer hidden"
                  onClick={openScreenRecordingSettings}
                  hidden={!isPermissionCheckDenied}
                >
                  {openScreenRecordingLabel}
                </Button>
              </div>
            </section>
            <p
              id="wizard-open-screen-recording-settings-note"
              data-open-screen-recording-settings-note
              className={`text-[14px] font-semibold text-zinc-500 dark:text-zinc-400 ${isPermissionCheckDenied ? '' : 'hidden'}`}
            >
              {toDisplayText(html.wizardAfterEnablingRestartFamiliar)}
            </p>
            <section
              id="wizard-recording-toggle-section"
              data-role="permission-recording-toggle-section"
              data-permission-toggle-visibility="hidden"
              className="hidden"
              hidden
              aria-hidden="true"
            />
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
          <div data-component-source="install-skill" className="space-y-5">
            <section className="space-y-2">
              <div className="skill-picker-options">
                {wizardHarnessOptions.map((entry) => (
                  <Label key={entry.value} className="skill-picker-option">
                    <span className="skill-picker-option-card">
                      <Checkbox
                        type="checkbox"
                        name="wizard-skill-harness"
                        value={entry.value}
                        data-skill-harness
                        checked={selectedSet.has(entry.value)}
                        onChange={handleHarnessChange}
                      />
                      <span className="skill-picker-icon" aria-hidden="true">
                        <img
                          src={
                            entry.value === 'claude' || entry.value === 'cloud-cowork'
                              ? './assets/skill-icons/claude-code.svg'
                              : entry.value === 'codex'
                                ? './assets/skill-icons/codex.svg'
                                : entry.value === 'antigravity'
                                  ? './assets/skill-icons/antigravity.svg'
                                  : './assets/skill-icons/cursor.svg'
                          }
                          alt=""
                        />
                      </span>
                      <span className="skill-picker-label">
                        {entry.value === 'claude'
                          ? toDisplayText(html.wizardHarnessClaudeCode)
                          : entry.value === 'cloud-cowork'
                            ? toDisplayText(html.wizardHarnessClaudeCowork)
                            : entry.value === 'codex'
                              ? toDisplayText(html.wizardHarnessCodex)
                              : entry.value === 'antigravity'
                                ? toDisplayText(html.wizardHarnessAntigravity)
                                : toDisplayText(html.wizardHarnessCursor)}
                      </span>
                    </span>
                    {entry.value === 'cursor' && (
                      <span
                        id="wizard-skill-cursor-restart-note"
                        data-skill-cursor-restart-note
                        className={`skill-picker-note ${selectedSet.has('cursor') ? '' : 'hidden'}`}
                      >
                        {toDisplayText(wizardSkillMessages.cursorRestartNote)}
                      </span>
                    )}
                  </Label>
                ))}
              </div>
            </section>

            <p
              id="wizard-skill-path"
              data-skill-install-path
              className={`text-[14px] text-zinc-500 dark:text-zinc-400 whitespace-pre-line ${pathInstallText ? '' : 'hidden'}`}
              aria-live="polite"
            >
              {pathInstallText}
            </p>
            <p
              id="wizard-skill-status"
              data-skill-install-status
              className={`text-[14px] text-emerald-600 dark:text-emerald-400 ${displayedSkillStatus ? '' : 'hidden'}`}
              aria-live="polite"
            >
              {displayedSkillStatus}
            </p>
            <p
              id="wizard-skill-error"
              data-skill-install-error
              className={`text-[14px] text-red-600 dark:text-red-400 ${toDisplayText(skillError) ? '' : 'hidden'}`}
              role="alert"
              aria-live="polite"
            >
              {toDisplayText(skillError)}
            </p>

            <div
              id="wizard-cloud-cowork-guide"
              data-cloud-cowork-guide
              className={`react-install-guide-overlay ${wizardClaudeCoworkGuideVisible ? '' : 'react-hidden'}`}
              role="dialog"
              aria-modal="true"
              hidden={!wizardClaudeCoworkGuideVisible}
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
            >
              <div className="w-full max-w-[520px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-lg">
                <div className="space-y-1">
                  <CardTitle>
                    {toDisplayText(html.wizardClaudeCoworkGuideTitle)}
                  </CardTitle>
                  <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
                    {toDisplayText(html.wizardClaudeCoworkGuideSubtitle)}
                  </p>
                </div>
                <ol className="text-[14px] text-zinc-600 dark:text-zinc-300 space-y-1 list-decimal pl-4">
                  {wizardClaudeCoworkGuideSteps.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ol>
                <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
                  {CLOUD_COWORK_GUIDE_URL}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    id="wizard-cloud-cowork-copy-link"
                    data-action="cloud-cowork-copy-link"
                    type="button"
                    variant="outline"
                    className="px-3 py-1.5 text-[14px] font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                    onClick={() => {
                      void copyClaudeCoworkGuideLink()
                    }}
                  >
                    {toDisplayText(html.wizardClaudeCoworkGuideCopyLink)}
                  </Button>
                  <Button
                    id="wizard-cloud-cowork-done"
                    data-action="cloud-cowork-guide-done"
                    type="button"
                    variant="outline"
                    className="px-3 py-1.5 text-[14px] font-semibold bg-indigo-600 hover:bg-indigo-700 border border-indigo-600 hover:border-indigo-700 rounded-md text-white transition-colors cursor-pointer"
                    onClick={hideClaudeCoworkGuide}
                  >
                    {toDisplayText(html.wizardClaudeCoworkGuideDone)}
                  </Button>
                </div>
                <p
                  id="wizard-cloud-cowork-guide-status"
                  data-cloud-cowork-guide-status
                  className={`text-[14px] text-emerald-600 dark:text-emerald-400 ${toDisplayText(claudeCoworkGuideMessage) ? '' : 'hidden'}`}
                  aria-live="polite"
                >
                  {toDisplayText(claudeCoworkGuideMessage)}
                </p>
                <p
                  id="wizard-cloud-cowork-guide-error"
                  data-cloud-cowork-guide-error
                  className={`text-[14px] text-red-600 dark:text-red-400 ${toDisplayText(claudeCoworkGuideError) ? '' : 'hidden'}`}
                  role="alert"
                  aria-live="polite"
                >
                  {toDisplayText(claudeCoworkGuideError)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[360px] mx-auto space-y-5" data-wizard-step="4" hidden={wizardStep !== 4}>
          <div className="text-center space-y-2">
            <CardTitle>
              {toDisplayText(html.wizardAllSetTitle)}
            </CardTitle>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
              {toDisplayText(html.wizardAllSetDescription)}
            </p>
          </div>
          <section className="space-y-2">
            <CardTitle>
              {toDisplayText(html.wizardFaqTitle)}
            </CardTitle>
            <p className="text-[14px] text-zinc-400 dark:text-zinc-500 text-center">
              {toDisplayText(html.wizardFaqScrollHint)}
            </p>
            <Accordion type="single" collapsible className="space-y-2">
              {wizardFaq.map((entry, index) => (
                <AccordionItem
                  key={entry.question}
                  value={`faq-${index}`}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
                >
                  <AccordionTrigger className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
                    {entry.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-[14px] text-zinc-600 dark:text-zinc-300">
                    {entry.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
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
            className={`text-[14px] text-zinc-400 whitespace-nowrap ${canAdvance ? 'hidden' : ''}`}
            aria-live="polite"
          >
            {toDisplayText(mc.dashboard.wizard?.completeStepToContinue)}
          </span>
          <Button
            id="wizard-next"
            type="button"
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-[14px] font-medium text-white shadow-sm shadow-indigo-200 dark:shadow-none hover:shadow-md hover:shadow-indigo-500/20 active:translate-y-px transition-all ${wizardStep >= 4 ? 'hidden' : ''}`}
            onClick={goWizardNext}
            disabled={wizardStep >= 4 || !canAdvance}
            hidden={wizardStep >= 4}
          >
            {toDisplayText(html.wizardNext)}
          </Button>
          <Button
            id="wizard-done"
            type="button"
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-[14px] font-medium text-white shadow-sm shadow-indigo-200 dark:shadow-none hover:shadow-md hover:shadow-indigo-500/20 active:translate-y-px transition-all ${wizardStep >= 4 ? '' : 'hidden'}`}
            onClick={completeWizard}
            disabled={wizardStep < 4 || !canAdvance}
            hidden={wizardStep < 4}
          >
            {toDisplayText(mc.dashboard?.actions?.wizardDone)}
          </Button>
        </div>
      </div>
    </section>
  )
}
