import React from 'react'

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
  storageSectionProps
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

  return <StorageSection mc={mc} toDisplayText={toDisplayText} {...storageSectionProps} />
}
