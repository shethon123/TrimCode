import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (filename, content) => ipcRenderer.invoke('save-file', { filename, content }),
})
