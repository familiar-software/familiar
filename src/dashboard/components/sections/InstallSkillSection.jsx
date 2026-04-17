import React from 'react'

import { Checkbox } from '../ui/checkbox'
import { Label } from '../ui/label'
import { isInstallMode } from '../dashboard/dashboardConstants'

const skillIcons = {
  claude: './assets/skill-icons/claude-code.svg',
  codex: './assets/skill-icons/codex.svg',
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
  skillError
}) {
  const htmlCopy = mc?.dashboard?.html || {}
  const selectedSet = new Set(selectedHarnesses)
  const isCursorSelected = selectedSet.has('cursor')
  const statusText = toDisplayText(skillMessage)
  const pathText = isSkillInstalled ? '' : getFormattedInstallPaths(skillInstallPaths)
  // Standalone Skill settings is install-only — copy-paste rows
  // (Cowork, Any local agent) are wizard-only, since their flow is "paste
  // into your agent right now" rather than configure-and-forget.
  const installableOptions = wizardHarnessOptions.filter(isInstallMode)

  return (
    <section className="react-install-tab space-y-3">
      <div className="react-skill-picker-options">
        {installableOptions.map((entry) => (
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
    </section>
  )
}
