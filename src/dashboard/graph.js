(function (global) {
  const setMessageFallback = (elements, message) => {
    const targets = Array.isArray(elements) ? elements : [elements]
    const value = message || ''
    targets.filter(Boolean).forEach((element) => {
      element.textContent = value
      element.classList.toggle('hidden', !value)
    })
  }

  const toNumber = (value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : 0
  }

  const createGraph = (options = {}) => {
    const elements = options.elements || {}
    const jiminy = options.jiminy || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})
    const setGraphState = typeof options.setGraphState === 'function' ? options.setGraphState : () => {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : setMessageFallback
    const updateWizardUI = typeof options.updateWizardUI === 'function' ? options.updateWizardUI : () => {}

    const {
      syncButtons = [],
      syncStatuses = [],
      syncStats = [],
      syncProgress = [],
      syncWarnings = [],
      syncErrors = [],
      pruneButtons = [],
      pruneStatuses = [],
      statusPill,
      statusDot,
      statusLabel,
      percentLabel,
      barSynced,
      barPending,
      barNew,
      syncedCount,
      pendingCount,
      newCount,
      ignoredCount
    } = elements

    let isSyncing = false
    let isPruning = false
    let isMaxNodesExceeded = false

    const STATUS_TONES = {
      live: {
        pill: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/40',
        dot: 'bg-emerald-500',
        label: 'text-emerald-700 dark:text-emerald-400'
      },
      warning: {
        pill: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/40',
        dot: 'bg-amber-400',
        label: 'text-amber-700 dark:text-amber-400'
      },
      error: {
        pill: 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/40',
        dot: 'bg-red-500',
        label: 'text-red-700 dark:text-red-300'
      },
      syncing: {
        pill: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-900/40',
        dot: 'bg-indigo-500',
        label: 'text-indigo-600 dark:text-indigo-400'
      }
    }

    const setStatusPill = (tone, labelText) => {
      if (!statusPill && !statusDot && !statusLabel) {
        return
      }
      const preset = STATUS_TONES[tone] || STATUS_TONES.live
      if (statusPill) {
        statusPill.className = `flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${preset.pill}`
      }
      if (statusDot) {
        statusDot.className = `w-1.5 h-1.5 rounded-full ${preset.dot}`
      }
      if (statusLabel) {
        statusLabel.className = `text-[10px] font-medium ${preset.label}`
        statusLabel.textContent = labelText || statusLabel.textContent
      }
    }

    const setBarWidth = (element, width) => {
      if (element) {
        element.style.width = width
      }
    }

    const updateGraphMetrics = ({ syncedNodes, outOfSyncNodes, newNodes, totalNodes, ignoredFiles }) => {
      const total = Math.max(0, toNumber(totalNodes))
      const synced = Math.max(0, toNumber(syncedNodes))
      const outOfSync = Math.max(0, toNumber(outOfSyncNodes))
      const incoming = Math.max(0, toNumber(newNodes))
      const ignored = Math.max(0, toNumber(ignoredFiles))

      const syncedRatio = total > 0 ? synced / total : 0
      const pendingRatio = total > 0 ? outOfSync / total : 0
      const newRatio = total > 0 ? incoming / total : 0

      setBarWidth(barSynced, `${Math.min(100, syncedRatio * 100)}%`)
      setBarWidth(barPending, `${Math.min(100, pendingRatio * 100)}%`)
      setBarWidth(barNew, `${Math.min(100, newRatio * 100)}%`)

      if (percentLabel) {
        const percent = total > 0 ? Math.round(syncedRatio * 100) : 0
        percentLabel.textContent = `${percent}%`
      }

      if (syncedCount) {
        syncedCount.textContent = String(synced)
      }

      if (pendingCount) {
        pendingCount.textContent = String(outOfSync)
      }

      if (newCount) {
        newCount.textContent = String(incoming)
      }

      if (ignoredCount) {
        ignoredCount.textContent = String(ignored)
      }
    }

    const updateSyncButtonState = () => {
      syncButtons.forEach((button) => {
        button.disabled = isSyncing || isPruning || isMaxNodesExceeded
      })
    }

    const updatePruneButtonState = () => {
      const { currentContextFolderPath } = getState()
      const hasContextPath = Boolean(currentContextFolderPath)
      pruneButtons.forEach((button) => {
        button.disabled = isSyncing || isPruning || !hasContextPath
      })
    }

    const setSyncState = (nextIsSyncing) => {
      isSyncing = Boolean(nextIsSyncing)
      updateSyncButtonState()
      updatePruneButtonState()
    }

    const setPruneState = (nextIsPruning) => {
      isPruning = Boolean(nextIsPruning)
      updateSyncButtonState()
      updatePruneButtonState()
    }

    const showContextGraphLoading = () => {
      syncButtons.forEach((button) => {
        button.hidden = true
      })
      setMessage(syncStats, '')
      setMessage(syncProgress, 'Loading...')
      setStatusPill('syncing', 'Syncing')
      updateGraphMetrics({ syncedNodes: 0, outOfSyncNodes: 0, newNodes: 0, totalNodes: 0, ignoredFiles: 0 })
    }

    const showContextGraphCounts = ({ syncedNodes, outOfSyncNodes, newNodes, totalNodes, ignoredFiles }) => {
      syncButtons.forEach((button) => {
        button.hidden = false
      })
      const ignored = Math.max(0, toNumber(ignoredFiles))
      const statsText = `Synced: ${syncedNodes}/${totalNodes} | Out of sync: ${outOfSyncNodes}/${totalNodes} | New: ${newNodes} | Ignored: ${ignored}`
      setMessage(syncStats, statsText)
      setMessage(syncProgress, '')
      updateGraphMetrics({ syncedNodes, outOfSyncNodes, newNodes, totalNodes, ignoredFiles })
    }

    const refreshContextGraphStatus = async (options = {}) => {
      if (!jiminy.getContextGraphStatus) {
        setMessage(syncErrors, 'Context graph status bridge unavailable. Restart the app.')
        syncButtons.forEach((button) => {
          button.hidden = false
        })
        showContextGraphCounts({ syncedNodes: 0, outOfSyncNodes: 0, newNodes: 0, totalNodes: 0, ignoredFiles: 0 })
        setStatusPill('error', 'Unavailable')
        return
      }

      if (isSyncing) {
        return
      }

      showContextGraphLoading()
      isMaxNodesExceeded = false
      updateSyncButtonState()

      try {
        const { currentContextFolderPath, currentExclusions } = getState()
        const contextFolderPath = typeof options.contextFolderPath === 'string'
          ? options.contextFolderPath
          : currentContextFolderPath
        const exclusions = Array.isArray(options.exclusions) ? options.exclusions : currentExclusions
        const result = await jiminy.getContextGraphStatus({ contextFolderPath, exclusions })
        const syncedNodes = toNumber(result?.syncedNodes ?? 0)
        const outOfSyncNodes = toNumber(result?.outOfSyncNodes ?? 0)
        const newNodes = toNumber(result?.newNodes ?? 0)
        const totalNodes = toNumber(result?.totalNodes ?? 0)
        const ignoredFiles = toNumber(result?.ignoredFiles ?? 0)
        isMaxNodesExceeded = Boolean(result?.maxNodesExceeded)

        if (isMaxNodesExceeded) {
          setMessage(syncErrors, result?.message || 'Context graph exceeds MAX_NODES.')
        } else {
          setMessage(syncErrors, '')
        }

        showContextGraphCounts({ syncedNodes, outOfSyncNodes, newNodes, totalNodes, ignoredFiles })
        const isContextGraphSynced = totalNodes > 0 &&
          outOfSyncNodes === 0 &&
          newNodes === 0 &&
          syncedNodes === totalNodes

        if (isMaxNodesExceeded) {
          setStatusPill('error', 'Max nodes')
        } else if (totalNodes === 0 || outOfSyncNodes > 0 || newNodes > 0) {
          setStatusPill('warning', 'Needs sync')
        } else {
          setStatusPill('live', 'Ready')
        }

        setGraphState({
          isContextGraphSynced,
          hasCompletedSync: isContextGraphSynced ? true : undefined
        })
        updateWizardUI()
      } catch (error) {
        console.error('Failed to load context graph status', error)
        isMaxNodesExceeded = false
        setMessage(syncErrors, 'Failed to load context graph status.')
        showContextGraphCounts({ syncedNodes: 0, outOfSyncNodes: 0, newNodes: 0, totalNodes: 0, ignoredFiles: 0 })
        setStatusPill('error', 'Error')
      } finally {
        updateSyncButtonState()
      }
    }

    if (jiminy.onContextGraphProgress && syncProgress.length > 0) {
      jiminy.onContextGraphProgress((payload) => {
        if (!payload) {
          return
        }

        const progressText = `${payload.completed}/${payload.total}` +
          (payload.relativePath ? ` • ${payload.relativePath}` : '')
        setMessage(syncProgress, progressText)
      })
    }

    if (syncButtons.length > 0) {
      syncButtons.forEach((button) => {
        button.addEventListener('click', async () => {
          if (!jiminy.syncContextGraph) {
            setMessage(syncErrors, 'Sync bridge unavailable. Restart the app.')
            return
          }

          let shouldRefreshStatus = false
          setMessage(syncErrors, '')
          setMessage(syncStatuses, 'Syncing...')
          setMessage(syncWarnings, '')
          setMessage(syncProgress, '0/0')
          setSyncState(true)
          setStatusPill('syncing', 'Syncing')

          try {
            const result = await jiminy.syncContextGraph()
            if (result && result.ok) {
              const warnings = Array.isArray(result.warnings) ? result.warnings : []
              const errorCount = Array.isArray(result.errors) ? result.errors.length : 0
              const message = errorCount > 0
                ? `Sync completed with ${errorCount} error${errorCount === 1 ? '' : 's'}.`
                : warnings.length > 0
                  ? 'Sync completed with warnings.'
                  : 'Sync complete.'
              setMessage(syncStatuses, message)
              if (warnings.length > 0) {
                const warningText = warnings[0]?.path
                  ? `Warning: cycle detected at ${warnings[0].path}.`
                  : 'Warning: cycle detected in context folder.'
                setMessage(syncWarnings, warningText)
              }
              shouldRefreshStatus = true
              setGraphState({ hasCompletedSync: true })
              updateWizardUI()
            } else {
              setMessage(syncStatuses, '')
              setMessage(syncWarnings, '')
              setMessage(syncErrors, result?.message || 'Failed to sync context graph.')
              setStatusPill('error', 'Sync failed')
            }
          } catch (error) {
            console.error('Failed to sync context graph', error)
            setMessage(syncStatuses, '')
            setMessage(syncWarnings, '')
            setMessage(syncErrors, 'Failed to sync context graph.')
            setStatusPill('error', 'Sync failed')
          } finally {
            setSyncState(false)
            if (shouldRefreshStatus) {
              await refreshContextGraphStatus()
            }
          }
        })
      })
    }

    if (pruneButtons.length > 0) {
      pruneButtons.forEach((button) => {
        button.addEventListener('click', async () => {
          if (!jiminy.pruneContextGraph) {
            setMessage(syncErrors, 'Prune bridge unavailable. Restart the app.')
            return
          }

          setMessage(syncErrors, '')
          setMessage(pruneStatuses, 'Pruning...')
          setPruneState(true)

          try {
            const result = await jiminy.pruneContextGraph()
            if (result && result.ok) {
              const message = result.deleted ? 'Pruned.' : 'Nothing to prune.'
              setMessage(pruneStatuses, message)
              await refreshContextGraphStatus()
            } else {
              setMessage(pruneStatuses, '')
              setMessage(syncErrors, result?.message || 'Failed to prune context graph.')
            }
          } catch (error) {
            console.error('Failed to prune context graph', error)
            setMessage(pruneStatuses, '')
            setMessage(syncErrors, 'Failed to prune context graph.')
          } finally {
            setPruneState(false)
          }
        })
      })
    }

    return {
      refreshContextGraphStatus,
      updatePruneButtonState,
      showLoading: showContextGraphLoading,
      handleSectionChange: (nextSection) => {
        if (nextSection === 'graph') {
          void refreshContextGraphStatus()
        }
      }
    }
  }

  const registry = global.JiminyGraph || {}
  registry.createGraph = createGraph
  global.JiminyGraph = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(window)
