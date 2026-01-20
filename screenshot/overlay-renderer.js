const overlay = document.getElementById('overlay')
const selectionEl = document.getElementById('selection')
const hintEl = document.getElementById('hint')
const messageEl = document.getElementById('message')

const MIN_SELECTION_SIZE = 6

let isDragging = false
let isCapturing = false
let startX = 0
let startY = 0
let selection = { x: 0, y: 0, width: 0, height: 0 }

const parseDisplayId = () => {
  const params = new URLSearchParams(window.location.search)
  const displayId = params.get('displayId')
  return displayId ? displayId : null
}

const displayId = parseDisplayId()

const showMessage = (text) => {
  if (!messageEl) return
  messageEl.textContent = text
  messageEl.classList.toggle('hidden', !text)
}

const resetSelection = () => {
  selection = { x: 0, y: 0, width: 0, height: 0 }
  if (selectionEl) {
    selectionEl.classList.add('hidden')
  }
}

const updateSelection = (x1, y1, x2, y2) => {
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y2 - y1)

  selection = { x: left, y: top, width, height }

  if (!selectionEl) return
  selectionEl.style.left = `${left}px`
  selectionEl.style.top = `${top}px`
  selectionEl.style.width = `${width}px`
  selectionEl.style.height = `${height}px`
  selectionEl.classList.remove('hidden')
}

const isSelectionValid = () => selection.width >= MIN_SELECTION_SIZE && selection.height >= MIN_SELECTION_SIZE

const getSelectionInset = () => {
  if (!selectionEl) {
    return 0
  }

  const styles = window.getComputedStyle(selectionEl)
  const left = parseFloat(styles.borderLeftWidth) || 0
  const top = parseFloat(styles.borderTopWidth) || 0
  const right = parseFloat(styles.borderRightWidth) || 0
  const bottom = parseFloat(styles.borderBottomWidth) || 0

  return Math.max(left, top, right, bottom, 0)
}

const getAdjustedSelection = () => {
  const inset = getSelectionInset()
  if (inset <= 0) {
    return { ...selection }
  }

  return {
    x: selection.x + inset,
    y: selection.y + inset,
    width: selection.width - inset * 2,
    height: selection.height - inset * 2
  }
}

const startCapture = async () => {
  if (isCapturing) return

  if (!window.captureApi || !window.captureApi.grab) {
    showMessage('Capture bridge unavailable. Restart the app.')
    return
  }

  if (!isSelectionValid()) {
    showMessage('Selection is too small.')
    resetSelection()
    return
  }

  isCapturing = true
  showMessage('Capturing...')

  try {
    const adjustedSelection = getAdjustedSelection()
    if (adjustedSelection.width <= 0 || adjustedSelection.height <= 0) {
      console.warn('Selection collapsed after applying border inset', {
        selection,
        adjustedSelection
      })
      showMessage('Selection is too small.')
      isCapturing = false
      return
    }

    const result = await window.captureApi.grab({
      displayId,
      rectCss: adjustedSelection,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      screenOffset: {
        x: window.screenX || 0,
        y: window.screenY || 0
      }
    })

    if (!result || !result.ok) {
      showMessage(result?.error || 'Capture failed.')
      isCapturing = false
      return
    }
  } catch (error) {
    console.error('Capture failed', error)
    showMessage('Capture failed.')
    isCapturing = false
  }
}

if (overlay) {
  overlay.addEventListener('mousedown', (event) => {
    if (isCapturing) {
      return
    }
    if (event.button !== 0) return
    isDragging = true
    startX = event.clientX
    startY = event.clientY
    resetSelection()
    showMessage('')
    if (hintEl) {
      hintEl.classList.add('hidden')
    }
  })

  overlay.addEventListener('mousemove', (event) => {
    if (isCapturing) {
      return
    }
    if (!isDragging) return
    updateSelection(startX, startY, event.clientX, event.clientY)
  })

  overlay.addEventListener('mouseup', () => {
    if (isCapturing) {
      return
    }
    if (!isDragging) return
    isDragging = false
    if (!isSelectionValid()) {
      showMessage('Selection is too small.')
      resetSelection()
      return
    }
    startCapture()
  })
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (window.captureApi && window.captureApi.close) {
      window.captureApi.close()
    }
  }
})
