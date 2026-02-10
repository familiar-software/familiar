const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jiminy', {
  platform: process.platform,
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  pickContextFolder: () => ipcRenderer.invoke('settings:pickContextFolder'),
  saveSettings: (payload) => {
    const data = typeof payload === 'string' ? { contextFolderPath: payload } : payload
    return ipcRenderer.invoke('settings:save', data)
  },
  installSkill: (payload) => ipcRenderer.invoke('skills:install', payload),
  getSkillInstallStatus: (payload) => ipcRenderer.invoke('skills:status', payload),
  reregisterHotkeys: () => ipcRenderer.invoke('hotkeys:reregister'),
  suspendHotkeys: () => ipcRenderer.invoke('hotkeys:suspend'),
  resumeHotkeys: () => ipcRenderer.invoke('hotkeys:resume'),
  checkForUpdates: (payload) => ipcRenderer.invoke('updates:check', payload),
  getScreenStillsStatus: () => ipcRenderer.invoke('screenStills:getStatus'),
  startScreenStills: () => ipcRenderer.invoke('screenStills:start'),
  pauseScreenStills: () => ipcRenderer.invoke('screenStills:pause'),
  stopScreenStills: () => ipcRenderer.invoke('screenStills:stop'),
  simulateStillsHotkey: () => ipcRenderer.invoke('screenStills:simulateHotkey'),
  simulateStillsIdle: (payload) => ipcRenderer.invoke('screenStills:simulateIdle', payload),
  openStillsFolder: () => ipcRenderer.invoke('stills:openFolder'),
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
