# Disk-Backed Saved Files Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `~/Documents/trimcodes/` directory the single source of truth for the SAVED FILES sidebar — scan on launch, watch for external changes, trash real files on remove.

**Architecture:** The Electron main process gains a `savedFilesStore` module that scans the directory, watches it with `fs.watch` (300ms debounce), and pushes a file list to the renderer over IPC. Pure file-format helpers move to a new `src/shared/` module so the main process can parse headers without importing React. The renderer drops its `localStorage`-backed list and renders whatever the main process reports, with an inline error+retry state when the directory can't be read.

**Tech Stack:** Electron 35, electron-vite, React 18, Vitest (jsdom), Node `fs`/`fs.promises`/`fs.watch`, Electron `shell` (`trashItem`, `openPath`).

**Spec:** `docs/superpowers/specs/2026-08-30-disk-backed-saved-files-design.md`

## Global Constraints

- **Directory is fixed:** `join(homedir(), 'Documents', 'trimcodes')`. Route every access through `src/main/saveDir.js`. No settings UI.
- **File header format:** first line is exactly `` `# ${company} | ${refId}` ``. No timestamp line anywhere in the file.
- **Empty slots are still written** as `` `${i + 1} ` `` (number, single space, nothing).
- **Watcher:** Node built-in `fs.watch` only. No new dependency. `DEBOUNCE_MS = 300`.
- **Scan filters:** files only; name ends `.txt` (case-insensitive); name does not start with `.`; `size <= 1_000_000` (`MAX_BYTES`). Concurrency cap `CONCURRENCY = 8` for stat/read.
- **Sort:** by `mtimeMs` descending (newest first).
- **Delete = trash:** `shell.trashItem`, never `unlink`. Confirm first with copy `Move <name> to Trash?`.
- **Deviation from spec, intentional:** the spec places `formatFileContent` / `parseSavedFile` / `parseCodeLines` in `src/renderer/src/utils.jsx`. They go in `src/shared/savedFileFormat.js` instead (zero imports) so `src/main/` can use them without pulling React into the main bundle. `utils.jsx` re-exports them so renderer import paths are unchanged.
- **Record shape** pushed to the renderer: `{ name: string, mtimeMs: number, company: string, refId: string, count: number, hasHeader: boolean }`.
- **IPC result shapes:** scan → `{ ok: true, files: Record[] }` | `{ ok: false, error: string }`. read → `{ ok: true, content: string }` | `{ ok: false, error: string }`. trash / reveal → `{ ok: true }` | `{ ok: false, error: string }`. save (unchanged) → `{ success: true }` | `{ success: false, error: string }`.
- Run the full test suite with `npm test` (`vitest run`). Run the real app with `npm run dev`.

---

### Task 1: Shared file-format module

**Files:**
- Create: `src/shared/savedFileFormat.js`
- Test: `src/shared/savedFileFormat.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatFileContent(company: string, refId: string, slots: {code: string|null}[]) => string`
  - `parseSavedFile(text: string, filename: string) => { company, refId, count, hasHeader }`
  - `parseCodeLines(text: string) => { idx: number, code: string }[]` (`idx` zero-based)

- [ ] **Step 1: Write the failing tests**

Create `src/shared/savedFileFormat.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { formatFileContent, parseSavedFile, parseCodeLines } from './savedFileFormat.js'

describe('formatFileContent', () => {
  it('writes the header as the first line', () => {
    expect(formatFileContent('ACME', 'WO-1', [{ code: 'ABC' }]).split('\n')[0]).toBe('# ACME | WO-1')
  })

  it('writes one line per slot, empty slots as "N " with a trailing space', () => {
    const slots = [{ code: 'ABC' }, { code: null }, { code: 'DEF' }]
    expect(formatFileContent('ACME', 'WO-1', slots).split('\n')).toEqual([
      '# ACME | WO-1', '1 ABC', '2 ', '3 DEF',
    ])
  })

  it('writes the raw code unmodified', () => {
    const line = formatFileContent('A', 'B', [{ code: 'BOSCH-0445120123-7N91' }]).split('\n')[1]
    expect(line).toBe('1 BOSCH-0445120123-7N91')
  })
})

describe('parseSavedFile', () => {
  it('parses company and ref from the header line', () => {
    expect(parseSavedFile('# NORTHGATE DIESEL | WO-2026-04-081\n1 ABC\n', 'x.txt')).toEqual({
      company: 'NORTHGATE DIESEL', refId: 'WO-2026-04-081', count: 1, hasHeader: true,
    })
  })

  it('falls back to the filename without .txt when there is no header', () => {
    const r = parseSavedFile('1 ABC\n2 DEF\n', 'ASD123.txt')
    expect(r.company).toBe('ASD123')
    expect(r.refId).toBe('')
    expect(r.hasHeader).toBe(false)
    expect(r.count).toBe(2)
  })

  it('does not count the header, comment lines, blank lines, or empty slots', () => {
    expect(parseSavedFile('# A | B\n1 CODE\n2 \n3 CODE\n\n# note\n', 'x.txt').count).toBe(2)
  })

  it('counts a bare code line with no leading number', () => {
    expect(parseSavedFile('# A | B\nJUSTACODE\n', 'x.txt').count).toBe(1)
  })

  it('parses CRLF files identically to LF', () => {
    expect(parseSavedFile('# A | B\r\n1 CODE\r\n2 \r\n', 'x.txt')).toEqual({
      company: 'A', refId: 'B', count: 1, hasHeader: true,
    })
  })
})

describe('parseCodeLines', () => {
  it('returns zero-based index and trimmed code for each numbered line', () => {
    expect(parseCodeLines('# A | B\n1 ABC\n2 DEF\n')).toEqual([
      { idx: 0, code: 'ABC' }, { idx: 1, code: 'DEF' },
    ])
  })

  it('skips the header, empty slots, and blank lines', () => {
    expect(parseCodeLines('# A | B\n1 ABC\n2 \n\n3 GHI\n')).toEqual([
      { idx: 0, code: 'ABC' }, { idx: 2, code: 'GHI' },
    ])
  })

  it('keeps a code at its original slot index when earlier slots are empty', () => {
    expect(parseCodeLines('5 LAST\n')).toEqual([{ idx: 4, code: 'LAST' }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- savedFileFormat`
Expected: FAIL — `Failed to resolve import "./savedFileFormat.js"`.

- [ ] **Step 3: Implement the module**

Create `src/shared/savedFileFormat.js`:

```js
// Pure helpers for the trimcodes .txt file format. No DOM, no React —
// imported by both the renderer (via utils.jsx) and the main-process
// folder scanner.

const HEADER_RE = /^#\s*(.*?)\s*\|\s*(.*)$/

export function formatFileContent(company, refId, slots) {
  const lines = [`# ${company} | ${refId}`]
  slots.forEach((slot, i) => {
    lines.push(slot.code ? `${i + 1} ${slot.code}` : `${i + 1} `)
  })
  return lines.join('\n')
}

export function parseSavedFile(text, filename) {
  const lines = String(text).split(/\r?\n/)
  const headerMatch = lines[0] ? lines[0].match(HEADER_RE) : null

  let company, refId, hasHeader, bodyLines
  if (headerMatch) {
    company = headerMatch[1].trim()
    refId = headerMatch[2].trim()
    hasHeader = true
    bodyLines = lines.slice(1)
  } else {
    company = filename.replace(/\.txt$/i, '')
    refId = ''
    hasHeader = false
    bodyLines = lines
  }

  let count = 0
  for (const line of bodyLines) {
    if (!line.trim()) continue
    if (line.startsWith('#')) continue
    if (line.replace(/^\s*\d+\s*/, '').trim()) count++
  }

  return { company, refId, count, hasHeader }
}

export function parseCodeLines(text) {
  const out = []
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith('#')) continue
    const m = line.match(/^(\d+)\s+(.+)$/)
    if (!m) continue
    const code = m[2].trim()
    if (code) out.push({ idx: Number(m[1]) - 1, code })
  }
  return out
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- savedFileFormat`
Expected: PASS (12 assertions across 3 describes).

- [ ] **Step 5: Commit**

```bash
git add src/shared/savedFileFormat.js src/shared/savedFileFormat.test.js
git commit -m "feat: add shared savedFileFormat module (header format + parsers)"
```

---

### Task 2: Point the renderer at the shared format module

**Files:**
- Modify: `src/renderer/src/utils.jsx` (remove `pad2`, `nowStamp`, `nowStampFile`, the local `formatFileContent`; add a re-export; add `Icon.Refresh`)
- Modify: `src/renderer/src/utils.test.jsx` (drop the obsolete `formatFileContent` block)
- Modify: `src/renderer/src/App.jsx` (import line; `saveFile` call site; drop the `stamp:` field)

**Interfaces:**
- Consumes: `formatFileContent`, `parseSavedFile`, `parseCodeLines` from Task 1.
- Produces: `utils.jsx` re-exports `formatFileContent`, `parseSavedFile`, `parseCodeLines`. New `Icon.Refresh` component `({size?, color?}) => JSX`.

- [ ] **Step 1: Update `utils.test.jsx`**

Remove the entire `describe('formatFileContent', ...)` block (it asserts the removed timestamp line). Change the import line from:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildFilename, formatFileContent, normalizeSearch } from './utils'
```

to:

```js
import { describe, it, expect } from 'vitest'
import { buildFilename, normalizeSearch } from './utils'
```

Leave the `buildFilename` and `normalizeSearch` describes untouched.

- [ ] **Step 2: Run tests to confirm the suite still passes without that block**

Run: `npm test`
Expected: PASS. `savedFileFormat` tests + remaining `utils` tests green.

- [ ] **Step 3: Edit `utils.jsx`**

Delete these three functions entirely: `pad2` (the `const pad2 = ...` line), `nowStamp`, `nowStampFile`. Delete the local `formatFileContent` function. Keep `nowStamp`? No — verify nothing else in `utils.jsx` references `pad2`/`nowStamp`/`nowStampFile` after removal (only those three used `pad2`).

Add, near the other named exports at the top of the file (after the `import` lines):

```js
export { formatFileContent, parseSavedFile, parseCodeLines } from '../../shared/savedFileFormat.js'
```

Add a `Refresh` entry to the `Icon` object (match the style of the sibling icons):

```js
  Refresh: ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  ),
```

- [ ] **Step 4: Edit `App.jsx`**

Change the import on line 2 — remove `nowStamp`:

```js
import { TWEAK_DEFAULTS, FONT_STACKS, uid, groupCode, trimRight, beep, QrPreview, Icon, buildFilename, formatFileContent, parseCodeLines, normalizeSearch } from './utils'
```

In `saveFile`, change:

```js
const body = formatFileContent(slots, tweaks.trimDigits)
```

to:

```js
const body = formatFileContent(company, refId, slots)
```

In `persistSave`, delete the single line `stamp: nowStamp(),` from the `record` object literal. Leave the rest of `persistSave` for now (it is rewritten in Task 5).

- [ ] **Step 5: Run tests and launch the app**

Run: `npm test`
Expected: PASS.

Run: `npm run dev`. Scan a code, fill company + ref, Save. Open `~/Documents/trimcodes/<COMPANY><REF>.txt` in a text editor.
Expected: first line is `# <COMPANY> | <REF>`, then numbered slot lines, empty slots as `N `. No `[timestamp]` line.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/utils.jsx src/renderer/src/utils.test.jsx src/renderer/src/App.jsx
git commit -m "feat: write # COMPANY | REF header, drop timestamp helpers"
```

---

### Task 3: `saveDir` module (path + guard)

**Files:**
- Create: `src/main/saveDir.js`
- Test: `src/main/saveDir.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SAVE_DIR: string` — absolute path `~/Documents/trimcodes`.
  - `ensureSaveDir() => void` — `mkdirSync(SAVE_DIR, { recursive: true })`.
  - `safeResolve(name: string) => string` — absolute path inside `SAVE_DIR`; throws if `name` contains a path separator, NUL, is `.`/`..`, is empty, or is not a string.

- [ ] **Step 1: Write the failing tests**

Create `src/main/saveDir.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { sep } from 'node:path'
import { SAVE_DIR, safeResolve } from './saveDir.js'

describe('safeResolve', () => {
  it('joins a bare filename onto SAVE_DIR', () => {
    expect(safeResolve('ABC123.txt')).toBe(SAVE_DIR + sep + 'ABC123.txt')
  })

  it('throws on a forward-slash path', () => {
    expect(() => safeResolve('../evil.txt')).toThrow()
    expect(() => safeResolve('sub/ABC.txt')).toThrow()
  })

  it('throws on a backslash path', () => {
    expect(() => safeResolve('sub\\ABC.txt')).toThrow()
  })

  it('throws on "." and ".."', () => {
    expect(() => safeResolve('.')).toThrow()
    expect(() => safeResolve('..')).toThrow()
  })

  it('throws on empty or non-string input', () => {
    expect(() => safeResolve('')).toThrow()
    expect(() => safeResolve(null)).toThrow()
    expect(() => safeResolve(undefined)).toThrow()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- saveDir`
Expected: FAIL — cannot resolve `./saveDir.js`.

- [ ] **Step 3: Implement the module**

Create `src/main/saveDir.js`:

```js
import { join, sep } from 'node:path'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'

export const SAVE_DIR = join(homedir(), 'Documents', 'trimcodes')

export function ensureSaveDir() {
  mkdirSync(SAVE_DIR, { recursive: true })
}

// Resolve a bare filename to an absolute path inside SAVE_DIR.
// Throws if the name could escape the directory.
export function safeResolve(name) {
  if (
    typeof name !== 'string' || name.length === 0 ||
    name.includes('/') || name.includes('\\') || name.includes('\0') ||
    name === '.' || name === '..'
  ) {
    throw new Error(`Invalid filename: ${JSON.stringify(name)}`)
  }
  const full = join(SAVE_DIR, name)
  if (!full.startsWith(SAVE_DIR + sep)) {
    throw new Error(`Filename escapes save directory: ${name}`)
  }
  return full
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- saveDir`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/saveDir.js src/main/saveDir.test.js
git commit -m "feat: add saveDir module with SAVE_DIR and safeResolve guard"
```

---

### Task 4: Main-process folder store, IPC, and preload

**Files:**
- Create: `src/main/savedFilesStore.js`
- Modify: `src/main/index.js` (full rewrite of the IPC section + wiring)
- Modify: `src/preload/index.js` (full rewrite)

**Interfaces:**
- Consumes: `SAVE_DIR`, `ensureSaveDir`, `safeResolve` (Task 3); `parseSavedFile` (Task 1).
- Produces:
  - `savedFilesStore.js`: `initSavedFilesStore(getWindow: () => BrowserWindow|null) => void`, `scanAndBroadcast() => Promise<{ok:true,files:Record[]}|{ok:false,error:string}>`, `disposeSavedFilesStore() => void`.
  - IPC channels (renderer-invokable via `window.electronAPI`): `listSavedFiles()`, `readSavedFile(name)`, `trashFile(name)`, `revealSaveDir()`, plus the existing `saveFile` / `fileExists`.
  - Renderer event: `window.electronAPI.onSavedFilesUpdate(cb: (payload) => void) => (unsubscribe: () => void)` listening on channel `saved-files:update`.

- [ ] **Step 1: Implement `savedFilesStore.js`**

Create `src/main/savedFilesStore.js`:

```js
import { watch } from 'node:fs'
import { readdir, stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SAVE_DIR, ensureSaveDir } from './saveDir.js'
import { parseSavedFile } from '../shared/savedFileFormat.js'

const DEBOUNCE_MS = 300
const MAX_BYTES = 1_000_000
const CONCURRENCY = 8

let getWindow = () => null
let watcher = null
let debounceTimer = null

export function initSavedFilesStore(getWindowFn) {
  getWindow = getWindowFn
  startWatcher()
  scanAndBroadcast()
}

export function disposeSavedFilesStore() {
  if (watcher) { try { watcher.close() } catch {} watcher = null }
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
}

function startWatcher() {
  if (watcher) return
  try {
    watcher = watch(SAVE_DIR, { persistent: true }, () => scheduleScan())
    watcher.on('error', handleWatcherError)
  } catch (err) {
    handleWatcherError(err)
  }
}

function handleWatcherError() {
  if (watcher) { try { watcher.close() } catch {} watcher = null }
  scanAndBroadcast()
}

function scheduleScan() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { debounceTimer = null; scanAndBroadcast() }, DEBOUNCE_MS)
}

async function mapCapped(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function scanAndBroadcast() {
  if (!watcher) startWatcher()
  const result = await scan()
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('saved-files:update', result)
  }
  return result
}

async function scan() {
  let entries
  try {
    entries = await readdir(SAVE_DIR, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') {
      try {
        ensureSaveDir()
        entries = await readdir(SAVE_DIR, { withFileTypes: true })
      } catch (err2) {
        return { ok: false, error: err2.message }
      }
    } else {
      return { ok: false, error: err.message }
    }
  }

  const names = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.txt') && !e.name.startsWith('.'))
    .map((e) => e.name)

  const statted = await mapCapped(names, CONCURRENCY, async (name) => {
    try {
      const s = await stat(join(SAVE_DIR, name))
      return s.size > MAX_BYTES ? null : { name, mtimeMs: s.mtimeMs }
    } catch {
      return null
    }
  })

  const records = await mapCapped(statted.filter(Boolean), CONCURRENCY, async (f) => {
    try {
      const text = await readFile(join(SAVE_DIR, f.name), 'utf8')
      const { company, refId, count, hasHeader } = parseSavedFile(text, f.name)
      return { name: f.name, mtimeMs: f.mtimeMs, company, refId, count, hasHeader }
    } catch {
      return null
    }
  })

  const files = records.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs)
  return { ok: true, files }
}
```

- [ ] **Step 2: Rewrite `src/main/index.js`**

Replace the whole file with:

```js
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
```

- [ ] **Step 3: Rewrite `src/preload/index.js`**

```js
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
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm test`
Expected: PASS (no test changes; this confirms nothing imported from these files broke — `savedFileFormat` / `saveDir` suites still green).

- [ ] **Step 5: Manually verify the IPC in the running app**

Run: `npm run dev`. Open the renderer devtools console (View ▸ Toggle Developer Tools) and run:

```js
await window.electronAPI.listSavedFiles()
```

Expected: `{ ok: true, files: [ { name, mtimeMs, company, refId, count, hasHeader }, ... ] }` for the `.txt` files currently in `~/Documents/trimcodes/`, newest first.

Then subscribe and mutate the folder from a terminal / file manager:

```js
const off = window.electronAPI.onSavedFilesUpdate(u => console.log('update', u))
```

- `touch ~/Documents/trimcodes/ZZZTEST.txt` → within ~300ms an `update` logs with `ZZZTEST.txt` present.
- `mv ~/Documents/trimcodes/ZZZTEST.txt ~/Documents/trimcodes/ZZZTEST2.txt` → `update` shows the rename.
- `rm ~/Documents/trimcodes/ZZZTEST2.txt` → `update` shows it gone.
- `touch ~/Documents/trimcodes/note.md` and `touch ~/Documents/trimcodes/.hidden.txt` → neither appears.
- `head -c 1100000 /dev/zero | tr '\0' 'x' > ~/Documents/trimcodes/BIG.txt` → `BIG.txt` does not appear; `rm` it.

Error path:

```js
// with the app running:
// chmod 000 ~/Documents/trimcodes    (run in a terminal)
await window.electronAPI.listSavedFiles()   // => { ok: false, error: "EACCES: ..." }
// chmod 755 ~/Documents/trimcodes
await window.electronAPI.listSavedFiles()   // => { ok: true, files: [...] }
```

Call `off()` when done.

- [ ] **Step 6: Commit**

```bash
git add src/main/savedFilesStore.js src/main/index.js src/preload/index.js
git commit -m "feat: scan+watch trimcodes dir in main, expose over IPC"
```

---

### Task 5: Renderer reads the sidebar from disk

**Files:**
- Modify: `src/renderer/src/App.jsx` (state, mount effect, `persistSave`, `deleteFile`, `openFile`, `confirmTrash`, `localStorage` cleanup, `ConfirmTrashModal` component, `Sidebar` list mapping + error block)

**Interfaces:**
- Consumes: `window.electronAPI.listSavedFiles`, `onSavedFilesUpdate`, `readSavedFile`, `trashFile`, `revealSaveDir`, `saveFile` (Task 4); `parseCodeLines`, `Icon` (Task 2).
- Produces: nothing consumed by later tasks except the `Sidebar` prop set `{ savedFiles, onOpen, onDelete, error, onRefresh, onReveal }` (Task 6 fills in the header buttons).

- [ ] **Step 1: Swap `localStorage` persistence and add disk state**

In `App.jsx`:

Add `useCallback` to the React import:

```js
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
```

Delete `const fileCounter = useRef(1)`.

Add next to the other `useState` calls:

```js
  const [savedFilesError, setSavedFilesError] = useState(null)
  const [trashPending, setTrashPending] = useState(null)
```

In the mount effect that reads `trimcode:session`, delete these two lines:

```js
        if (saved.savedFiles) setSavedFiles(saved.savedFiles)
        if (saved.fileCounter) fileCounter.current = saved.fileCounter
```

In the effect that writes `trimcode:session`, change the body to:

```js
  useEffect(() => {
    const data = { company, refId, slots }
    localStorage.setItem('trimcode:session', JSON.stringify(data))
  }, [company, refId, slots])
```

- [ ] **Step 2: Add the disk-sync effect**

Add after the `trimcode:session` effects:

```js
  const applyUpdate = useCallback((res) => {
    if (res && res.ok) {
      setSavedFiles(res.files)
      setSavedFilesError(null)
    } else {
      setSavedFilesError((res && res.error) || 'Could not read the trimcodes folder')
    }
  }, [])

  const refreshSavedFiles = useCallback(() => {
    window.electronAPI.listSavedFiles().then(applyUpdate)
  }, [applyUpdate])

  useEffect(() => {
    refreshSavedFiles()
    return window.electronAPI.onSavedFilesUpdate(applyUpdate)
  }, [refreshSavedFiles, applyUpdate])
```

- [ ] **Step 3: Simplify `persistSave`**

Replace the whole `persistSave` function with:

```js
  const persistSave = async (filename, body) => {
    const result = await window.electronAPI.saveFile(filename, body)
    if (!result.success) { showToast(`Save failed: ${result.error}`); return }
    showToast(`Saved → ${filename}`)
  }
```

- [ ] **Step 4: Replace `deleteFile` and add `confirmTrash`**

Replace `deleteFile` with:

```js
  const deleteFile = (rec) => setTrashPending(rec)

  const confirmTrash = async () => {
    const rec = trashPending
    setTrashPending(null)
    const res = await window.electronAPI.trashFile(rec.name)
    if (!res.ok) showToast(`Trash failed: ${res.error}`)
  }
```

- [ ] **Step 5: Rewrite `openFile` to read from disk**

Replace the whole `openFile` function with:

```js
  const openFile = async (rec) => {
    if (slots.some(s => s.code)) {
      if (!confirm('Load this file? Current unsaved scans will be replaced.')) return
    }
    const res = await window.electronAPI.readSavedFile(rec.name)
    if (!res.ok) { showToast(`Could not open ${rec.name}`); return }

    const pairs = parseCodeLines(res.content)
    const maxIdx = pairs.reduce((m, p) => Math.max(m, p.idx), -1)
    const count = Math.max(tweaks.slotCount, maxIdx + 1)
    const next = EMPTY_SLOTS(count)
    pairs.forEach(({ idx, code }) => {
      if (idx >= 0 && idx < next.length) next[idx] = { ...next[idx], code, scannedAt: Date.now() }
    })

    setCompany(rec.company)
    setRefId(rec.hasHeader ? rec.refId : '')
    setSlots(next)
    showToast(`Opened ${rec.name}`)
  }
```

- [ ] **Step 6: Guard keyboard shortcuts while the trash modal is open**

In the `onKeyDown` handler, change:

```js
      if (overwritePending || newFilePending) return
```

to:

```js
      if (overwritePending || newFilePending || trashPending) return
```

and add `trashPending` to that effect's dependency array (the one ending `..., tweaks, savedFiles])`).

- [ ] **Step 7: Wire the new props into `<Sidebar>` and render `ConfirmTrashModal`**

Change the `<Sidebar .../>` element to:

```jsx
        <Sidebar
          savedFiles={savedFiles}
          onOpen={openFile}
          onDelete={deleteFile}
          error={savedFilesError}
          onRefresh={refreshSavedFiles}
          onReveal={() => window.electronAPI.revealSaveDir()}
        />
```

Add, next to the `{newFilePending && (...)}` block:

```jsx
      {trashPending && (
        <ConfirmTrashModal
          filename={trashPending.name}
          onConfirm={confirmTrash}
          onCancel={() => setTrashPending(null)}
        />
      )}
```

Add the component near `NewFileModal`:

```jsx
function ConfirmTrashModal({ filename, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-label">
            <span className="dot dot-warn" />
            MOVE FILE TO TRASH
          </span>
        </div>
        <div className="modal-body">
          <div className="ow-msg">Move <strong>{filename}</strong> to Trash?</div>
          <div className="ow-sub">You can restore it from your system Trash.</div>
        </div>
        <div className="modal-foot">
          <button className="ghost-btn" onClick={onCancel}>CANCEL</button>
          <button className="primary-btn" onClick={onConfirm}>MOVE TO TRASH</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Update the `Sidebar` list to the disk record shape + error block**

In the `Sidebar` function, add `error`, `onRefresh`, `onReveal` to the destructured props: `function Sidebar({ savedFiles, onOpen, onDelete, error, onRefresh, onReveal }) {`.

Change the `results` memo to also match on `name`:

```js
  const results = useMemo(() => {
    if (!searching) return savedFiles
    return savedFiles.filter((rec) =>
      normalizeSearch(rec.company).includes(nq) ||
      normalizeSearch(rec.refId).includes(nq) ||
      normalizeSearch(rec.name).includes(nq)
    )
  }, [savedFiles, nq, searching])
```

Wrap the search box + result count + list/empty region so it is replaced by an error block when `error` is set. Immediately after the `<div className="side-head">...</div>`, structure the body as:

```jsx
      {error ? (
        <div className="side-empty side-error">
          <div className="se-icon"><Icon.Folder size={26}/></div>
          <div className="se-title">FOLDER UNAVAILABLE</div>
          <div className="se-hint">{error}</div>
          <button className="ghost-btn" onClick={onRefresh}>RETRY</button>
        </div>
      ) : (
        <>
          {/* existing: side-search, side-result-count, and the
              savedFiles.length === 0 / no-matches / side-list ternary */}
        </>
      )}
```

In the `side-list` rows, replace `rec.id` / `rec.filename` usage:

```jsx
          {results.map((rec) => (
            <div key={rec.name} className="side-item" onClick={() => onOpen(rec)}>
              <div className="si-main">
                <div className="si-title">
                  {rec.hasHeader
                    ? <>{rec.company} <span className="sep">·</span> {rec.refId}</>
                    : rec.name}
                </div>
                <div className="si-meta">{rec.count} codes</div>
                <div className="si-file">{rec.name}</div>
              </div>
              <div className="si-del" onClick={(e) => { e.stopPropagation(); onDelete(rec) }}><Icon.X size={12}/></div>
            </div>
          ))}
```

- [ ] **Step 9: Run tests and exercise the app**

Run: `npm test`
Expected: PASS.

Run: `npm run dev` and verify:
- Sidebar lists the `.txt` files already in `~/Documents/trimcodes/`, newest first, titled `COMPANY · REF` from each header.
- Save a new file → its row appears within a moment (via the post-save broadcast).
- Add / rename / delete a `.txt` from a file manager → the list follows within ~300ms.
- Click a row → company + ref populate, slots fill at their numbered positions.
- Click a row's ✕ → `Move <name>.txt to Trash?` modal → confirm → file lands in the OS Trash (recoverable) and the row disappears. Cancel → nothing happens.
- Put a `.md` / dotfile / >1 MB `.txt` in the folder → none appear.
- Drop a headerless `.txt` (no `#` first line) in the folder → it lists with the filename as its title; opening it fills slots from its numbered lines.
- `chmod 000 ~/Documents/trimcodes` (in a terminal) then refocus the window → sidebar shows `FOLDER UNAVAILABLE` + the error + `RETRY`. `chmod 755` back, click `RETRY` → the list returns. (No crash, no silent empty list.)

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/App.jsx
git commit -m "feat: source SAVED FILES sidebar from disk, trash on remove"
```

---

### Task 6: Sidebar header — refresh + reveal buttons

**Files:**
- Modify: `src/renderer/src/App.jsx` (`Sidebar` header markup)
- Modify: `src/renderer/src/styles.css` (header action buttons, error hint color)

**Interfaces:**
- Consumes: `onRefresh`, `onReveal` props (Task 5); `Icon.Refresh`, `Icon.Folder` (Task 2).
- Produces: nothing.

- [ ] **Step 1: Update the `side-head` markup**

In `Sidebar`, replace the `<div className="side-head">...</div>` with:

```jsx
      <div className="side-head">
        <span><Icon.Folder/> SAVED FILES</span>
        <div className="side-head-actions">
          <button className="side-icon-btn" onClick={onRefresh} title="Rescan folder">
            <Icon.Refresh size={14}/>
          </button>
          <button className="side-icon-btn" onClick={onReveal} title="Open folder in file manager">
            <Icon.Folder size={14}/>
          </button>
          <span className="side-count">{savedFiles.length}</span>
        </div>
      </div>
```

- [ ] **Step 2: Add styles**

Append to `styles.css` (near the other `.side-*` rules, around line 618):

```css
.side-head-actions { display: inline-flex; align-items: center; gap: 8px; }
.side-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 4px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  background: var(--bg);
  color: var(--fg-mute);
  cursor: pointer;
  transition: color .15s, border-color .15s;
}
.side-icon-btn:hover { color: var(--fg); border-color: var(--fg-dim); }
.side-error .se-hint { color: var(--danger); word-break: break-word; }
```

- [ ] **Step 3: Verify in the app**

Run: `npm run dev`
- Header shows a refresh icon and a folder icon left of the count.
- Refresh → list reconciles with the folder (add a file externally without waiting for the watcher, click refresh, see it appear).
- Folder button → the OS file manager opens `~/Documents/trimcodes/`.
- Trigger the error state again (`chmod 000`) → `FOLDER UNAVAILABLE` hint renders in the danger color; `RETRY` and the header refresh both recover it after `chmod 755`.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.jsx src/renderer/src/styles.css
git commit -m "feat: add rescan + reveal-folder buttons to sidebar header"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Scan configured dir on launch, build list from disk | 4 (`initSavedFilesStore` → `scanAndBroadcast`), 5 (renderer consumes) |
| Re-scan on window focus | 4 (`win.on('focus', scanAndBroadcast)`) |
| `fs.watch` watcher, 300ms debounce | 4 (`startWatcher` + `scheduleScan`) |
| Ignore non-.txt, dotfiles, >1 MB | 4 (`scan` filter + `MAX_BYTES`) |
| Create dir if missing on first run | 3 (`ensureSaveDir`), 4 (called on ready + ENOENT retry in `scan`) |
| Inline error + retry when unreadable, no crash / no empty list | 4 (`{ok:false,error}`), 5 (`side-error` block + `RETRY`) |
| Sort by mtime, newest first | 4 (`.sort((a,b) => b.mtimeMs - a.mtimeMs)`) |
| Write `# <COMPANY> | <REF>` header on save | 1 (`formatFileContent`), 2 (call site) |
| Parse header for company/ref; count non-empty non-comment lines | 1 (`parseSavedFile`) |
| Headerless files list with filename as title | 1 (filename fallback), 5 (`rec.hasHeader ? ... : rec.name`) |
| Lazy / capped concurrent reads | 4 (`mapCapped`, `CONCURRENCY = 8`) |
| Remove action deletes the real file, to system trash | 4 (`trash-file` → `shell.trashItem`), 5 (`confirmTrash`) |
| Confirmation naming the file | 5 (`ConfirmTrashModal`, "Move <name> to Trash?") |
| After deletion, watcher updates the list (no local mutation) | 5 (`confirmTrash` does not touch `savedFiles`) |
| "Reveal in file manager" action | 6 (folder button → `revealSaveDir` → `shell.openPath`) |
| Manual refresh button | 6 (refresh button → `refreshSavedFiles`) |

**2. Placeholder scan:** The only non-literal block is Task 5 Step 8's `{/* existing: ... */}` comment, which points at clearly identified existing JSX in the same function rather than unwritten code — the surrounding structure and every changed line are given in full. No `TODO`/`TBD`/"handle edge cases".

**3. Type consistency:** Record shape `{ name, mtimeMs, company, refId, count, hasHeader }` is identical in Task 4 (`scan`), the Global Constraints, and Task 5 (`rec.name`, `rec.company`, `rec.refId`, `rec.count`, `rec.hasHeader`). `scanAndBroadcast` / `initSavedFilesStore` / `disposeSavedFilesStore` names match between Task 4's module and its `index.js` imports. `applyUpdate` / `refreshSavedFiles` names match between Task 5 Step 2 and Steps 7–8. IPC channel `saved-files:update` matches between `savedFilesStore.js` (`send`) and `preload/index.js` (`on`/`removeListener`). `formatFileContent(company, refId, slots)` signature matches between Task 1, Task 2's call site, and the tests.
