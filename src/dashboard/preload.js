const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('familiar', {
  platform: process.platform,
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  checkScreenRecordingPermission: () => ipcRenderer.invoke('settings:checkScreenRecordingPermission'),
  requestScreenRecordingPermission: () => ipcRenderer.invoke('settings:requestScreenRecordingPermission'),
  openScreenRecordingSettings: () => ipcRenderer.invoke('settings:openScreenRecordingSettings'),
  listInstalledApps: () => ipcRenderer.invoke('settings:listInstalledApps'),
  getInstalledAppIcon: (payload) => ipcRenderer.invoke('settings:getInstalledAppIcon', payload || {}),
  pickContextFolder: () => ipcRenderer.invoke('settings:pickContextFolder'),
  openStorageInFinder: () => ipcRenderer.invoke('settings:openStorageInFinder'),
  moveContextFolder: (payload) => ipcRenderer.invoke('settings:moveContextFolder', payload),
  saveSettings: (payload) => {
    const data = typeof payload === 'string' ? { contextFolderPath: payload } : payload
    return ipcRenderer.invoke('settings:save', data)
  },
  installSkill: (payload) => ipcRenderer.invoke('skills:install', payload),
  getSkillInstallStatus: (payload) => ipcRenderer.invoke('skills:status', payload),
  checkForUpdates: (payload) => ipcRenderer.invoke('updates:check', payload),
  getScreenStillsStatus: () => ipcRenderer.invoke('screenStills:getStatus'),
  startScreenStills: () => ipcRenderer.invoke('screenStills:start'),
  pauseScreenStills: () => ipcRenderer.invoke('screenStills:pause'),
  stopScreenStills: () => ipcRenderer.invoke('screenStills:stop'),
  simulateStillsIdle: (payload) => ipcRenderer.invoke('screenStills:simulateIdle', payload),
  getTrayRecordingLabelForE2E: () => ipcRenderer.invoke('e2e:tray:getRecordingLabel'),
  clickTrayRecordingActionForE2E: () => ipcRenderer.invoke('e2e:tray:clickRecordingAction'),
  openTrayMenuForE2E: () => ipcRenderer.invoke('e2e:tray:openMenu'),
  getTrayIconStateForE2E: () => ipcRenderer.invoke('e2e:tray:getIconState'),
  getTrayMenuItemsForE2E: () => ipcRenderer.invoke('e2e:tray:getMenuItems'),
  getToastEventsForE2E: (options) => ipcRenderer.invoke('e2e:toast:events', options || {}),
  onAlwaysRecordWhenActiveChanged: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('settings:alwaysRecordWhenActiveChanged', listener)
    return () => ipcRenderer.removeListener('settings:alwaysRecordWhenActiveChanged', listener)
  },
  onScreenStillsStateChanged: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('settings:screenStillsStateChanged', listener)
    return () => ipcRenderer.removeListener('settings:screenStillsStateChanged', listener)
  },
  onSettingsWindowOpened: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('settings:window-opened', listener)
    return () => ipcRenderer.removeListener('settings:window-opened', listener)
  },
  openStillsFolder: () => ipcRenderer.invoke('stills:openFolder'),
  deleteFilesAt: ({ requestedAtMs, deleteWindow } = {}) =>
    ipcRenderer.invoke('storage:deleteFiles', { requestedAtMs, deleteWindow }),
  getStorageUsageBreakdown: () => ipcRenderer.invoke('storage:getUsageBreakdown'),
  copyCurrentLogToClipboard: () => ipcRenderer.invoke('logs:copyCurrentLogToClipboard'),
  onUpdateDownloadProgress: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('updates:download-progress', listener)
    return () => ipcRenderer.removeListener('updates:download-progress', listener)
  },
  onUpdateDownloaded: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('updates:downloaded', listener)
    return () => ipcRenderer.removeListener('updates:downloaded', listener)
  }
})

const microcopy = ipcRenderer.sendSync('microcopy:get-sync')
if (microcopy && typeof microcopy === 'object') {
  contextBridge.exposeInMainWorld('FamiliarMicrocopySource', {
    microcopy
  })
}
