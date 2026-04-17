import React from 'react'

import { AutomateSection } from './AutomateSection'
import { CompleteSection } from './CompleteSection'
import { InstallSkillSection } from './InstallSkillSection'
import { RecordingSection } from './RecordingSection'
import { StorageSection } from './StorageSection'
import { WizardSection } from './WizardSection'

export function DashboardShellSectionContent({
  activeSection,
  mc,
  toDisplayText,
  wizardSectionProps,
  recordingSectionProps,
  installSectionProps,
  storageSectionProps,
  automateSectionProps
}) {
  if (activeSection === 'wizard') {
    return <WizardSection mc={mc} toDisplayText={toDisplayText} {...wizardSectionProps} />
  }

  if (activeSection === 'complete') {
    return <CompleteSection mc={mc} toDisplayText={toDisplayText} />
  }

  if (activeSection === 'recording') {
    return <RecordingSection mc={mc} toDisplayText={toDisplayText} {...recordingSectionProps} />
  }

  if (activeSection === 'install-skill' || activeSection === 'installSkill') {
    return <InstallSkillSection mc={mc} toDisplayText={toDisplayText} {...installSectionProps} />
  }

  if (activeSection === 'automate') {
    return <AutomateSection mc={mc} toDisplayText={toDisplayText} {...automateSectionProps} />
  }

  return <StorageSection mc={mc} toDisplayText={toDisplayText} {...storageSectionProps} />
}
