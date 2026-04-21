import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'

const SAVE_DIR = join(homedir(), 'Documents', 'trimcodes')

function ensureSaveDir() {
  mkdirSync(SAVE_DIR, { recursive: true })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
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
}

app.whenReady().then(() => {
  ensureSaveDir()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('save-file', (_event, { filename, content }) => {
  try {
    writeFileSync(join(SAVE_DIR, filename), content, 'utf8')
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
