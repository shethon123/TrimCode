import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { writeFileSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { SAVE_DIR, ensureSaveDir, safeResolve } from './saveDir.js'
import { initSavedFilesStore, scanAndBroadcast, disposeSavedFilesStore } from './savedFilesStore.js'

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 1050,
    minWidth: 1300,
    minHeight: 750,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('focus', () => { scanAndBroadcast() })
  return win
}

app.whenReady().then(() => {
  ensureSaveDir()
  createWindow()
  initSavedFilesStore(() => BrowserWindow.getAllWindows()[0] ?? null)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  disposeSavedFilesStore()
})

ipcMain.handle('save-file', async (_event, { filename, content }) => {
  try {
    writeFileSync(safeResolve(filename), content, 'utf8')
    await scanAndBroadcast()
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('file-exists', (_event, filename) => {
  try {
    return existsSync(safeResolve(filename))
  } catch {
    return false
  }
})

ipcMain.handle('list-saved-files', () => scanAndBroadcast())

ipcMain.handle('read-saved-file', async (_event, filename) => {
  try {
    const content = await readFile(safeResolve(filename), 'utf8')
    return { ok: true, content }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('trash-file', async (_event, filename) => {
  try {
    await shell.trashItem(safeResolve(filename))
    await scanAndBroadcast()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('reveal-save-dir', async () => {
  try {
    ensureSaveDir()
    await shell.openPath(SAVE_DIR)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})
