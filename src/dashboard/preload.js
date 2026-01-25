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
  onContextGraphProgress: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('contextGraph:progress', listener)
    return () => ipcRenderer.removeListener('contextGraph:progress', listener)
  }
})
