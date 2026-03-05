import React from 'react'

import { InstallSkillSection } from './InstallSkillSection'
import { HeartbeatsSection } from './HeartbeatsSection'
import { RecordingSection } from './RecordingSection'
import { StorageSection } from './StorageSection'
import { WizardSection } from './WizardSection'

export function DashboardShellSectionContent({
  activeSection,
  mc,
  toDisplayText,
  wizardSectionProps,
  recordingSectionProps,
  heartbeatsSectionProps,
  installSectionProps,
  storageSectionProps
}) {
  if (activeSection === 'wizard') {
    return <WizardSection mc={mc} toDisplayText={toDisplayText} {...wizardSectionProps} />
  }

  if (activeSection === 'recording') {
    return <RecordingSection mc={mc} toDisplayText={toDisplayText} {...recordingSectionProps} />
  }

  if (activeSection === 'install-skill' || activeSection === 'installSkill') {
    return <InstallSkillSection mc={mc} toDisplayText={toDisplayText} {...installSectionProps} />
  }

  if (activeSection === 'heartbeats') {
    return <HeartbeatsSection mc={mc} toDisplayText={toDisplayText} {...heartbeatsSectionProps} />
  }

  return <StorageSection mc={mc} toDisplayText={toDisplayText} {...storageSectionProps} />
}
