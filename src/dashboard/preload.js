const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jiminy', {
  platform: process.platform,
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  pickContextFolder: () => ipcRenderer.invoke('settings:pickContextFolder'),
  pickExclusion: (contextFolderPath) => ipcRenderer.invoke('settings:pickExclusion', contextFolderPath),
  saveSettings: (payload) => {
    const data = typeof payload === 'string' ? { contextFolderPath: payload } : payload
    return ipcRenderer.invoke('settings:save', data)
  },
  reregisterHotkeys: () => ipcRenderer.invoke('hotkeys:reregister'),
  suspendHotkeys: () => ipcRenderer.invoke('hotkeys:suspend'),
  resumeHotkeys: () => ipcRenderer.invoke('hotkeys:resume'),
  getContextGraphStatus: (payload) => ipcRenderer.invoke('contextGraph:status', payload),
  syncContextGraph: () => ipcRenderer.invoke('contextGraph:sync'),
  pruneContextGraph: () => ipcRenderer.invoke('contextGraph:prune'),
  getHistoryFlows: (options) => ipcRenderer.invoke('history:listFlows', options),
  getHistoryEvents: (flowId) => ipcRenderer.invoke('history:listEvents', flowId),
  exportHistoryFlow: (flowId) => ipcRenderer.invoke('history:exportFlow', flowId),
  openInFolder: (targetPath) => ipcRenderer.invoke('history:openInFolder', targetPath),
  checkForUpdates: (payload) => ipcRenderer.invoke('updates:check', payload),
  getScreenRecordingStatus: () => ipcRenderer.invoke('screenRecording:getStatus'),
  startScreenRecording: () => ipcRenderer.invoke('screenRecording:start'),
  stopScreenRecording: () => ipcRenderer.invoke('screenRecording:stop'),
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
  },
  onContextGraphProgress: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('contextGraph:progress', listener)
    return () => ipcRenderer.removeListener('contextGraph:progress', listener)
  }
})
