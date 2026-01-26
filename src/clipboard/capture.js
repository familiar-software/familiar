const { clipboard } = require('electron')
const { randomUUID } = require('node:crypto')
const { getClipboardDirectory, saveClipboardToDirectory } = require('./storage')
const { enqueueAnalysis } = require('../analysis')
const { loadSettings, validateContextFolderPath } = require('../settings')
const { showToast } = require('../toast')
const { recordEvent } = require('../history')

async function captureClipboard () {
  const text = clipboard.readText()

  if (!text || text.trim().length === 0) {
    console.log('Clipboard capture skipped: clipboard is empty')
    showToast({
      title: 'Clipboard Empty',
      body: 'No text content in clipboard to capture.',
      type: 'warning'
    })
    return { ok: false, reason: 'empty-clipboard' }
  }

  const settings = loadSettings()
  const contextFolderPath = settings.contextFolderPath || ''
  const validation = validateContextFolderPath(contextFolderPath)

  if (!validation.ok) {
    console.warn('Clipboard capture failed: context folder not configured', { message: validation.message })
    showToast({
      title: 'Context Folder Required',
      body: validation.message || 'Set a Context Folder Path in Settings before capturing.',
      type: 'warning'
    })
    return { ok: false, reason: 'no-context-folder', message: validation.message }
  }

  const clipboardDirectory = getClipboardDirectory(validation.path)
  if (!clipboardDirectory) {
    console.error('Clipboard capture failed: clipboard directory could not be resolved')
    showToast({
      title: 'Capture Failed',
      body: 'Could not determine clipboard directory.',
      type: 'error'
    })
    recordEvent({
      contextFolderPath: validation.path,
      flowId: randomUUID(),
      trigger: 'capture_clipboard',
      step: 'clipboard',
      status: 'failed',
      summary: 'Clipboard capture failed',
      detail: 'Clipboard directory could not be resolved.'
    })
    return { ok: false, reason: 'no-clipboard-directory' }
  }

  const flowId = randomUUID()
  recordEvent({
    contextFolderPath: validation.path,
    flowId,
    trigger: 'capture_clipboard',
    step: 'clipboard',
    status: 'started',
    summary: 'Clipboard capture started'
  })

  try {
    const { path: savedPath } = await saveClipboardToDirectory(text, clipboardDirectory)
    console.log('Clipboard captured', { path: savedPath })

    recordEvent({
      contextFolderPath: validation.path,
      flowId,
      trigger: 'capture_clipboard',
      step: 'clipboard',
      status: 'success',
      summary: 'Clipboard captured',
      outputPath: savedPath
    })

    showToast({
      title: 'Clipboard Captured',
      body: 'Text content saved and queued for analysis.',
      type: 'success'
    })

    void enqueueAnalysis({ result_md_path: savedPath, flow_id: flowId, trigger: 'capture_clipboard' }).catch((error) => {
      console.error('Failed to enqueue clipboard analysis', { error, savedPath })
      showToast({
        title: 'Clipboard Captured (Not Queued)',
        body: 'Text content saved, but analysis could not be queued. Try again.',
        type: 'warning'
      })
    })

    return { ok: true, path: savedPath }
  } catch (error) {
    console.error('Clipboard capture failed', error)
    showToast({
      title: 'Capture Failed',
      body: 'Failed to save clipboard content. Check write permissions.',
      type: 'error'
    })
    recordEvent({
      contextFolderPath: validation.path,
      flowId,
      trigger: 'capture_clipboard',
      step: 'clipboard',
      status: 'failed',
      summary: 'Clipboard capture failed',
      detail: 'Failed to save clipboard content.',
      errorMessage: error?.message
    })
    return { ok: false, reason: 'save-failed', error }
  }
}

module.exports = {
  captureClipboard
}
