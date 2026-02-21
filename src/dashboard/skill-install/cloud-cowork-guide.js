(function registerCloudCoWorkGuide(global) {
  const MARKETPLACE_REPO_URL = 'https://github.com/familiar-software/familiar-claude-cowork-skill'

  function toArray(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean)
    }
    return value ? [value] : []
  }

  function createCloudCoWorkGuide(options = {}) {
    const elements = options.elements || {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : () => {}

    const guideContainers = toArray(elements.guideContainers)
    const closeButtons = toArray(elements.closeButtons)
    const copyLinkButtons = toArray(elements.copyLinkButtons)
    const statusElements = toArray(elements.statusElements)
    const errorElements = toArray(elements.errorElements)

    function showGuide() {
      guideContainers.forEach((element) => {
        element.classList.toggle('hidden', false)
      })
    }

    function hideGuide() {
      guideContainers.forEach((element) => {
        element.classList.toggle('hidden', true)
      })
    }

    function clearGuideMessages() {
      setMessage(statusElements, '')
      setMessage(errorElements, '')
    }

    async function copyMarketplaceUrl() {
      try {
        if (!global.navigator || !global.navigator.clipboard || typeof global.navigator.clipboard.writeText !== 'function') {
          throw new Error('Clipboard API unavailable')
        }
        await global.navigator.clipboard.writeText(MARKETPLACE_REPO_URL)
        setMessage(errorElements, '')
        setMessage(statusElements, 'Marketplace link copied.')
        console.log('Cloud Cowork marketplace link copied')
        return { ok: true }
      } catch (error) {
        console.error('Failed to copy Cloud Cowork marketplace link', error)
        setMessage(statusElements, '')
        setMessage(errorElements, 'Failed to copy link.')
        return { ok: false, message: 'Failed to copy link.' }
      }
    }

    function openGuide() {
      clearGuideMessages()
      showGuide()
      console.log('Cloud Cowork guide opened')
      return { ok: true, url: MARKETPLACE_REPO_URL }
    }

    function closeGuide() {
      hideGuide()
      clearGuideMessages()
      console.log('Cloud Cowork guide closed')
    }

    closeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        closeGuide()
      })
    })

    copyLinkButtons.forEach((button) => {
      button.addEventListener('click', () => {
        void copyMarketplaceUrl()
      })
    })

    return {
      openGuide,
      closeGuide,
      copyMarketplaceUrl,
      getMarketplaceUrl: () => MARKETPLACE_REPO_URL
    }
  }

  const registry = global.FamiliarCloudCoWorkGuide || {}
  registry.createCloudCoWorkGuide = createCloudCoWorkGuide
  registry.MARKETPLACE_REPO_URL = MARKETPLACE_REPO_URL
  global.FamiliarCloudCoWorkGuide = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(typeof window !== 'undefined' ? window : global)
