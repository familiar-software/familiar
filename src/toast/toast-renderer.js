const { ipcRenderer } = require('electron')

const icons = {
  success: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
  </svg>`,
  error: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
  </svg>`,
  warning: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>`,
  info: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>`
}

const actionIcons = {
  'open-in-folder': `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>`
}

const actionTitles = {
  'open-in-folder': 'Open in Folder'
}

const toastEl = document.getElementById('toast')
const titleEl = document.getElementById('title')
const bodyEl = document.getElementById('body')
const iconEl = document.getElementById('icon')
const closeBtn = document.getElementById('close-btn')
const actionsEl = document.getElementById('actions')
const progressBarEl = document.getElementById('toast-progress-bar')

ipcRenderer.on('toast-data', (_event, { title, body, type = 'info', size = 'compact', actions = [], duration = 0 }) => {
  titleEl.textContent = title || ''
  bodyEl.textContent = body || ''
  iconEl.innerHTML = icons[type] || icons.info
  iconEl.className = 'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center border'

  const iconStyles = {
    success: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/40',
    error: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40',
    warning: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/40',
    info: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-900/40'
  }
  iconEl.className = `${iconEl.className} ${iconStyles[type] || iconStyles.info}`

  // Apply size-specific styles
  if (size === 'large') {
    toastEl.classList.remove('max-w-[320px]')
    toastEl.classList.add('max-w-[420px]')
    bodyEl.classList.remove('truncate')
    bodyEl.classList.add('whitespace-pre-line', 'break-words', 'leading-relaxed')
    closeBtn.classList.remove('hidden')
  } else {
    toastEl.classList.remove('max-w-[420px]')
    toastEl.classList.add('max-w-[320px]')
    bodyEl.classList.remove('whitespace-pre-line', 'leading-relaxed', 'truncate')
    bodyEl.classList.add('break-words')
    closeBtn.classList.add('hidden')
  }

  // for now disabled the progress bar

  // // dynamically set the progress bar for the toast
  // if (progressBarEl) {
  //   const durationMs = Number(duration)
  //   if (Number.isFinite(durationMs) && durationMs > 0) {
  //     progressBarEl.style.transition = 'none'
  //     progressBarEl.style.width = '0%'
  //     void progressBarEl.offsetWidth
  //     progressBarEl.style.transition = `width ${durationMs}ms linear`
  //     requestAnimationFrame(() => {
  //       progressBarEl.style.width = '100%'
  //     })
  //   } else {
  //     progressBarEl.style.transition = 'none'
  //     progressBarEl.style.width = '0%'
  //   }
  // }

  // Render action buttons
  actionsEl.innerHTML = ''
  if (actions.length > 0) {
    actionsEl.classList.remove('hidden')
    actions.forEach(({ label, action, data }) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      const iconMarkup = actionIcons[action]
      if (iconMarkup) {
        btn.innerHTML = iconMarkup
        const title = actionTitles[action] || label
        if (title) {
          btn.setAttribute('aria-label', title)
          btn.title = title
        }
        btn.className =
          'w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors'
      } else {
        btn.textContent = label
        btn.className =
          'px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors'
      }
      btn.addEventListener('click', () => {
        ipcRenderer.send('toast-action', { action, data })
      })
      actionsEl.appendChild(btn)
    })
  } else {
    actionsEl.classList.add('hidden')
  }

  // IMPORTANT: after DOM updates & layout, measure actual height and ask main to resize the window
  // Two rAFs makes sure layout is fully computed after class changes + button insertion.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const rect = toastEl.getBoundingClientRect()
      const desiredHeight = Math.ceil(rect.height)
      ipcRenderer.send('toast-resize', { height: desiredHeight })
    })
  })
})

closeBtn.addEventListener('click', () => {
  ipcRenderer.send('toast-close')
})
