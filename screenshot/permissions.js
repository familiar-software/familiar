const { app, dialog, systemPreferences } = require('electron')

async function ensureScreenRecordingPermission () {
  if (process.platform !== 'darwin') {
    return { ok: true }
  }

  if (!systemPreferences || typeof systemPreferences.getMediaAccessStatus !== 'function') {
    return { ok: true }
  }

  const status = systemPreferences.getMediaAccessStatus('screen')
  if (status === 'granted') {
    return { ok: true }
  }

  console.warn('Screen recording permission not granted', {
    status,
    execPath: process.execPath,
    appPath: app.getAppPath(),
    appName: app.getName(),
    isPackaged: app.isPackaged
  })

  await dialog.showMessageBox({
    type: 'warning',
    title: 'Screen Recording Permission Required',
    message: 'Jiminy needs Screen Recording permission to capture your screen.',
    detail: 'Open System Settings > Privacy & Security > Screen Recording and enable Jiminy, then try again.',
    buttons: ['OK']
  })

  return { ok: true, status, warning: true }
}

module.exports = {
  ensureScreenRecordingPermission
}
