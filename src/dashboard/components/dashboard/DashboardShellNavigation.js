export const buildDashboardNavigation = (mc = {}) => [
  { id: 'wizard', label: mc.dashboard?.sections?.wizard?.title },
  { id: 'storage', label: mc.dashboard?.sections?.storage?.title },
  { id: 'recording', label: mc.dashboard?.sections?.recording?.title },
  { id: 'install-skill', label: mc.dashboard?.sections?.installSkill?.title }
]
