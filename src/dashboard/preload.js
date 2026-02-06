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
  getScreenRecordingStatus: () => ipcRenderer.invoke('screenRecording:getStatus'),
  startScreenRecording: () => ipcRenderer.invoke('screenRecording:start'),
  pauseScreenRecording: () => ipcRenderer.invoke('screenRecording:pause'),
  stopScreenRecording: () => ipcRenderer.invoke('screenRecording:stop'),
  simulateRecordingHotkey: () => ipcRenderer.invoke('screenRecording:simulateHotkey'),
  simulateRecordingIdle: (payload) => ipcRenderer.invoke('screenRecording:simulateIdle', payload),
  openRecordingFolder: () => ipcRenderer.invoke('recording:openFolder'),
  runRecordingQuery: (payload) => ipcRenderer.invoke('recordingQuery:run', payload),
  getRecordingQueryAvailability: () => ipcRenderer.invoke('recordingQuery:availability'),
  getRecordingQueryEstimate: (payload) => ipcRenderer.invoke('recordingQuery:estimate', payload),
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
