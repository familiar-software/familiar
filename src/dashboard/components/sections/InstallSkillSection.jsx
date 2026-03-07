import React from 'react'

import { CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Label } from '../ui/label'
import { CLOUD_COWORK_GUIDE_URL } from '../dashboard/dashboardConstants'

const skillIcons = {
  claude: './assets/skill-icons/claude-code.svg',
  'cloud-cowork': './assets/skill-icons/claude-code.svg',
  codex: './assets/skill-icons/codex.svg',
  antigravity: './assets/skill-icons/antigravity.svg',
  cursor: './assets/skill-icons/cursor.svg'
}

function getFormattedInstallPaths(skillInstallPaths) {
  const entries = Object.entries(skillInstallPaths || {})
    .filter(([, path]) => typeof path === 'string' && path.length > 0)
    .map(([harness, path]) => `${harness}: ${path}`)

  return entries.join('\n')
}

export function InstallSkillSection({
  mc,
  wizardHarnessOptions,
  selectedHarnesses,
  handleHarnessChange,
  skillInstallPaths,
  isSkillInstalled,
  toDisplayText,
  skillMessage,
  skillError,
  wizardClaudeCoworkGuideVisible,
  copyClaudeCoworkGuideLink,
  claudeCoworkGuideMessage,
  claudeCoworkGuideError,
  hideClaudeCoworkGuide
}) {
  const htmlCopy = mc?.dashboard?.html || {}
  const claudeCoworkGuideSteps = Array.from({ length: 12 }, (_unused, index) =>
    toDisplayText(htmlCopy[`wizardClaudeCoworkGuideStep${index + 1}`])
  ).filter(Boolean)
  const selectedSet = new Set(selectedHarnesses)
  const isCursorSelected = selectedSet.has('cursor')
  const statusText =
    toDisplayText(skillMessage)
    || (wizardClaudeCoworkGuideVisible ? toDisplayText(claudeCoworkGuideMessage) : '')
  const pathText = isSkillInstalled ? '' : getFormattedInstallPaths(skillInstallPaths)

  return (
    <section className="react-card react-install-tab">
      <div className="react-skill-picker-options">
        {wizardHarnessOptions.map((entry) => (
          <Label key={entry.value} className="react-skill-picker-option">
            <span className="react-skill-picker-option-card">
              <Checkbox
                type="checkbox"
                id={`settings-skill-harness-${entry.value}`}
                name="settings-skill-harness"
                value={entry.value}
                checked={selectedSet.has(entry.value)}
                onChange={handleHarnessChange}
              />
              <span
                className={`react-skill-picker-icon ${entry.value === 'codex' || entry.value === 'cursor' ? 'react-skill-picker-icon--light-chip' : ''}`}
              >
                <img src={skillIcons[entry.value] || './assets/skill-icons/claude-code.svg'} alt="" />
              </span>
              <span className="react-skill-picker-label">{entry.label}</span>
            </span>
            {entry.value === 'cursor' ? (
              <span
                id="settings-skill-cursor-restart-note"
                className={`react-skill-picker-note ${isCursorSelected ? '' : 'react-hidden'}`}
              >
                {toDisplayText(htmlCopy.wizardCursorRestartNote)}
              </span>
            ) : null}
          </Label>
        ))}
      </div>

      <p id="settings-skill-path" className={`react-inline-status ${pathText ? '' : 'react-hidden'}`}>
        {pathText}
      </p>
      <p id="settings-skill-status" className={`react-inline-status ${statusText ? '' : 'react-hidden'}`}>
        {statusText}
      </p>
      {skillError ? (
        <p id="settings-skill-error" className="react-help-text react-help-text-error">
          {toDisplayText(skillError)}
        </p>
      ) : null}

      <div
        id="settings-cloud-cowork-guide"
        className={`react-install-guide-overlay ${wizardClaudeCoworkGuideVisible ? '' : 'react-hidden'}`}
        role="dialog"
        aria-modal="true"
        data-cloud-cowork-guide
      >
        <div className="react-install-guide-card">
          <div className="react-install-guide-title-wrap">
            <CardTitle>{toDisplayText(htmlCopy.wizardClaudeCoworkGuideTitle)}</CardTitle>
            <p className="react-install-guide-subtitle">{toDisplayText(htmlCopy.wizardClaudeCoworkGuideSubtitle)}</p>
          </div>
          <ol className="react-install-guide-steps">
            {claudeCoworkGuideSteps.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ol>
          <p className="react-inline-status">{CLOUD_COWORK_GUIDE_URL}</p>
          <div className="react-section-actions">
            <Button
              id="settings-cloud-cowork-copy-link"
              className="react-btn"
              variant="outline"
              type="button"
              onClick={() => {
                void copyClaudeCoworkGuideLink()
              }}
            >
              {toDisplayText(htmlCopy.wizardClaudeCoworkGuideCopyLink)}
            </Button>
            <Button
              id="settings-cloud-cowork-done"
              className="react-btn react-btn-subtle"
              variant="outline"
              type="button"
              onClick={hideClaudeCoworkGuide}
            >
              {toDisplayText(htmlCopy.wizardClaudeCoworkGuideDone)}
            </Button>
          </div>
          {toDisplayText(claudeCoworkGuideMessage) ? (
            <p className="react-help-text">{toDisplayText(claudeCoworkGuideMessage)}</p>
          ) : null}
          {toDisplayText(claudeCoworkGuideError) ? (
            <p className="react-help-text react-help-text-error">
              {toDisplayText(claudeCoworkGuideError)}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
