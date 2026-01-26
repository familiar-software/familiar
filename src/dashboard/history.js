(function (global) {
  const setMessageFallback = (elements, message) => {
    const targets = Array.isArray(elements) ? elements : [elements]
    const value = message || ''
    targets.filter(Boolean).forEach((element) => {
      element.textContent = value
      element.classList.toggle('hidden', !value)
    })
  }

  const createHistory = (options = {}) => {
    const elements = options.elements || {}
    const jiminy = options.jiminy || {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : setMessageFallback

    const {
      historyList,
      historyEmpty,
      historyError
    } = elements

    const formatHistoryTimestamp = (value) => {
      if (!value) {
        return ''
      }
      const date = new Date(Number(value))
      if (Number.isNaN(date.getTime())) {
        return ''
      }
      return date.toLocaleString()
    }

    const getStatusBadgeClasses = (status) => {
      switch ((status || '').toLowerCase()) {
        case 'success':
          return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
        case 'failed':
          return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
        case 'partial':
          return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
        case 'skipped':
          return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
        default:
          return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
      }
    }

    const renderHistoryEvents = (container, events) => {
      if (!container) {
        return
      }

      container.innerHTML = ''
      const list = Array.isArray(events) ? events : []
      if (list.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'text-xs text-zinc-400 dark:text-zinc-500'
        empty.textContent = 'No steps recorded.'
        container.appendChild(empty)
        return
      }

      list.forEach((event) => {
        const row = document.createElement('div')
        row.className = 'rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-2.5 space-y-1'

        const header = document.createElement('div')
        header.className = 'flex items-center justify-between gap-2'

        const title = document.createElement('div')
        title.className = 'text-xs font-semibold text-zinc-700 dark:text-zinc-200'
        const stepText = event?.step ? event.step : 'step'
        const statusText = event?.status ? event.status : 'started'
        title.textContent = `${stepText} • ${statusText}`

        const time = document.createElement('div')
        time.className = 'text-[10px] text-zinc-400 dark:text-zinc-500'
        time.textContent = formatHistoryTimestamp(event?.created_at)

        header.appendChild(title)
        header.appendChild(time)

        const detail = document.createElement('div')
        detail.className = 'text-[11px] text-zinc-600 dark:text-zinc-400'
        detail.textContent =
          event?.summary ||
          event?.detail ||
          event?.error_message ||
          ''

        row.appendChild(header)
        if (detail.textContent) {
          row.appendChild(detail)
        }

        if (event?.output_path) {
          const actionRow = document.createElement('div')
          actionRow.className = 'pt-1'
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50'
          button.textContent = 'Open in Folder'
          if (jiminy.openInFolder) {
            button.addEventListener('click', () => {
              jiminy.openInFolder(event.output_path)
            })
          } else {
            button.disabled = true
            button.title = 'Open in Folder unavailable.'
          }
          actionRow.appendChild(button)
          row.appendChild(actionRow)
        }

        container.appendChild(row)
      })
    }

    const setExportStatus = (element, message, tone = 'neutral') => {
      if (!element) {
        return
      }
      const value = message || ''
      const baseClass = 'text-[10px] transition-opacity'
      const toneClass = tone === 'error'
        ? 'text-red-500 dark:text-red-400'
        : tone === 'success'
          ? 'text-emerald-500 dark:text-emerald-400'
          : 'text-zinc-400 dark:text-zinc-500'
      element.className = `${baseClass} ${toneClass}`
      element.textContent = value
      element.classList.toggle('hidden', !value)
    }

    const handleExportFlow = async ({ flowId, statusElement, button } = {}) => {
      if (!flowId) {
        setExportStatus(statusElement, 'Missing flow id.', 'error')
        return
      }

      if (!jiminy.exportHistoryFlow) {
        setExportStatus(statusElement, 'Export unavailable.', 'error')
        return
      }

      setExportStatus(statusElement, 'Exporting...')
      if (button) {
        button.disabled = true
      }

      try {
        const result = await jiminy.exportHistoryFlow(flowId)
        if (result && result.ok) {
          setExportStatus(statusElement, 'Exported.', 'success')
        } else {
          setExportStatus(statusElement, result?.message || 'Export failed.', 'error')
        }
      } catch (error) {
        console.error('Failed to export history flow', error)
        setExportStatus(statusElement, 'Export failed.', 'error')
      } finally {
        if (button) {
          button.disabled = false
        }
      }
    }

    const renderHistoryFlows = (flows) => {
      if (!historyList) {
        return
      }

      historyList.innerHTML = ''
      const list = Array.isArray(flows) ? flows : []
      if (list.length === 0) {
        setMessage(historyEmpty, 'No history yet.')
        return
      }

      setMessage(historyEmpty, '')

      list.forEach((flow) => {
        const details = document.createElement('details')
        details.className = 'rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-sm'

        const summary = document.createElement('summary')
        summary.className = 'list-none cursor-pointer'

        const summaryRow = document.createElement('div')
        summaryRow.className = 'flex items-start justify-between gap-3'

        const summaryText = document.createElement('div')
        summaryText.className = 'text-sm font-semibold text-zinc-900 dark:text-zinc-100'
        summaryText.textContent =
          (typeof flow?.summary === 'string' && flow.summary.trim()) ||
          flow?.trigger ||
          'Recent flow'

        const meta = document.createElement('div')
        meta.className = 'flex flex-col items-end gap-1'

        const status = document.createElement('span')
        status.className = `text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${getStatusBadgeClasses(flow?.status)}`
        status.textContent = flow?.status || 'in_progress'

        const time = document.createElement('span')
        time.className = 'text-[10px] text-zinc-400 dark:text-zinc-500'
        time.textContent = formatHistoryTimestamp(flow?.updated_at || flow?.created_at)

        meta.appendChild(status)
        meta.appendChild(time)

        const actions = document.createElement('div')
        actions.className = 'flex items-center gap-2'

        const exportStatus = document.createElement('span')
        exportStatus.className = 'text-[10px] text-zinc-400 dark:text-zinc-500 hidden'

        const exportButton = document.createElement('button')
        exportButton.type = 'button'
        exportButton.className = 'inline-flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-700 px-1.5 py-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-300 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50'
        exportButton.title = 'Export flow'
        exportButton.setAttribute('aria-label', 'Export flow')
        exportButton.innerHTML = `
          <svg viewBox="0 0 20 20" aria-hidden="true" class="w-3.5 h-3.5 fill-current">
            <path d="M10 2.5a.75.75 0 0 1 .75.75v7.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V3.25A.75.75 0 0 1 10 2.5Z" />
            <path d="M3.5 12.5a.75.75 0 0 1 .75.75v2.5c0 .69.56 1.25 1.25 1.25h9a1.25 1.25 0 0 0 1.25-1.25v-2.5a.75.75 0 0 1 1.5 0v2.5A2.75 2.75 0 0 1 14.5 18h-9A2.75 2.75 0 0 1 2.75 15.75v-2.5a.75.75 0 0 1 .75-.75Z" />
          </svg>
        `

        exportButton.addEventListener('click', (event) => {
          if (event) {
            event.preventDefault()
            event.stopPropagation()
          }
          void handleExportFlow({ flowId: flow?.id, statusElement: exportStatus, button: exportButton })
        })

        actions.appendChild(exportButton)
        actions.appendChild(exportStatus)
        meta.appendChild(actions)

        summaryRow.appendChild(summaryText)
        summaryRow.appendChild(meta)
        summary.appendChild(summaryRow)

        const eventsContainer = document.createElement('div')
        eventsContainer.className = 'mt-3 space-y-2'

        details.appendChild(summary)
        details.appendChild(eventsContainer)

        if (flow?.id) {
          details.addEventListener('toggle', async () => {
            if (!details.open || details.dataset.loaded === 'true') {
              return
            }
            details.dataset.loaded = 'true'
            eventsContainer.textContent = 'Loading...'

            if (!jiminy.getHistoryEvents) {
              eventsContainer.textContent = 'History events unavailable.'
              return
            }

            try {
              const events = await jiminy.getHistoryEvents(flow.id)
              renderHistoryEvents(eventsContainer, events)
            } catch (error) {
              console.error('Failed to load history events', error)
              eventsContainer.textContent = 'Failed to load history events.'
            }
          })
        }

        historyList.appendChild(details)
      })
    }

    const refreshHistory = async () => {
      if (!historyList) {
        return
      }

      if (!jiminy.getHistoryFlows) {
        setMessage(historyError, 'History bridge unavailable. Restart the app.')
        renderHistoryFlows([])
        return
      }

      setMessage(historyError, '')
      setMessage(historyEmpty, 'Loading...')

      try {
        const flows = await jiminy.getHistoryFlows()
        renderHistoryFlows(flows)
      } catch (error) {
        console.error('Failed to load history flows', error)
        setMessage(historyError, 'Failed to load history.')
        renderHistoryFlows([])
      }
    }

    const handleSectionChange = (nextSection) => {
      if (nextSection === 'history') {
        void refreshHistory()
      }
    }

    return {
      refreshHistory,
      handleSectionChange
    }
  }

  const registry = global.JiminyHistory || {}
  registry.createHistory = createHistory
  global.JiminyHistory = registry

  // Export for Node/CommonJS so tests can require this module; browsers ignore this.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(window)
