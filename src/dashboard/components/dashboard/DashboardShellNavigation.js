export const buildDashboardNavigation = (mc = {}, { isDevelopmentMode = false } = {}) => {
  const navigation = [
    { id: 'wizard', label: mc.dashboard?.sections?.wizard?.title || 'Setup Wizard' },
    { id: 'storage', label: mc.dashboard?.sections?.storage?.title || 'Storage' },
    { id: 'recording', label: mc.dashboard?.sections?.recording?.title || 'Capturing' },
    { id: 'install-skill', label: mc.dashboard?.sections?.installSkill?.title || 'Connect Agent' }
  ]

  if (isDevelopmentMode) {
    navigation.push({
      id: 'heartbeats',
      label: mc.dashboard?.sections?.heartbeats?.title || 'Heartbeats'
    })
  }

  return navigation
}
