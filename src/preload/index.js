import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (filename, content) => ipcRenderer.invoke('save-file', { filename, content }),
  fileExists: (filename) => ipcRenderer.invoke('file-exists', filename),
  listSavedFiles: () => ipcRenderer.invoke('list-saved-files'),
  readSavedFile: (filename) => ipcRenderer.invoke('read-saved-file', filename),
  trashFile: (filename) => ipcRenderer.invoke('trash-file', filename),
  revealSaveDir: () => ipcRenderer.invoke('reveal-save-dir'),
  onSavedFilesUpdate: (cb) => {
    const listener = (_event, payload) => cb(payload)
    ipcRenderer.on('saved-files:update', listener)
    return () => ipcRenderer.removeListener('saved-files:update', listener)
  },
})
