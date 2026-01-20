const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('captureApi', {
  grab: (payload) => ipcRenderer.invoke('capture:grab', payload),
  close: () => ipcRenderer.invoke('capture:close')
})
