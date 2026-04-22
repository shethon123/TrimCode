# Overwrite Confirmation Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a themed in-app confirmation modal when SAVE FILE would overwrite an existing file on disk, and remove the sidebar re-download button.

**Architecture:** A new `file-exists` IPC handler checks disk state before saving. The renderer stores pending save data in state; if the file exists, the `OverwriteModal` component renders and either calls through to save or cancels. Shared save logic is extracted into a `persistSave` helper to avoid duplication.

**Tech Stack:** Electron (main process IPC), React (renderer), CSS custom properties for theming, Vitest for unit tests.

---

## File Map

| File | Change |
|------|--------|
| `src/main/index.js` | Add `existsSync` import + `file-exists` IPC handler |
| `src/preload/index.js` | Expose `fileExists` method on `electronAPI` |
| `src/renderer/src/App.jsx` | Add `overwritePending` state, `persistSave` helper, refactor `saveFile`, add `confirmOverwrite`, add `OverwriteModal` component, remove `redownload` + sidebar download button |
| `src/renderer/src/styles.css` | Add `.modal-sm`, `.modal-body`, `.modal-foot`, `.ow-*`, `.dot-warn` rules; update `.side-item` grid |

---

### Task 1: Add `file-exists` IPC handler to main process

**Files:**
- Modify: `src/main/index.js`

- [ ] **Step 1: Update the import line**

In `src/main/index.js`, replace line 3:

```js
import { mkdirSync, writeFileSync } from 'fs'
```

with:

```js
import { mkdirSync, writeFileSync, existsSync } from 'fs'
```

- [ ] **Step 2: Add the IPC handler**

After the existing `ipcMain.handle('save-file', ...)` block (after line 45), add:

```js
ipcMain.handle('file-exists', (_event, filename) => {
  return existsSync(join(SAVE_DIR, filename))
})
```

- [ ] **Step 3: Verify the full file looks correct**

`src/main/index.js` should now read:

```js
import { app, BrowserWindow, ipcMain } from 'electron/main'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
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

ipcMain.handle('file-exists', (_event, filename) => {
  return existsSync(join(SAVE_DIR, filename))
})
```

- [ ] **Step 4: Commit**

```bash
git add src/main/index.js
git commit -m "feat: add file-exists IPC handler to main process"
```

---

### Task 2: Expose `fileExists` in preload

**Files:**
- Modify: `src/preload/index.js`

- [ ] **Step 1: Add `fileExists` to the exposed API**

Replace the entire contents of `src/preload/index.js` with:

```js
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (filename, content) => ipcRenderer.invoke('save-file', { filename, content }),
  fileExists: (filename) => ipcRenderer.invoke('file-exists', filename),
})
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/index.js
git commit -m "feat: expose fileExists via preload"
```

---

### Task 3: Add overwrite modal styles

**Files:**
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Update `.side-item` grid columns**

In `src/renderer/src/styles.css`, find the `.side-item` rule (around line 437) and change `grid-template-columns`:

```css
.side-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: border-color .15s, background .15s;
}
```

- [ ] **Step 2: Remove the `.si-dl` style rule**

Find and delete this rule entirely (around line 453):

```css
.si-dl { color: var(--fg-dim); }
.side-item:hover .si-dl { color: var(--accent); }
```

- [ ] **Step 3: Add overwrite modal styles**

Append after the existing `/* ============ MODAL ============ */` block (after the `.modal` and `@keyframes zoomin` rules, around line 490), add:

```css
.modal-sm { width: min(480px, 92vw); }

.modal-body {
  padding: 20px;
  border-bottom: 1px solid var(--line);
}

.ow-msg {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--fg-dim);
  margin-bottom: 10px;
}

.ow-filename {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.06em;
  word-break: break-all;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  margin-bottom: 10px;
}

.ow-sub {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--fg-mute);
}

.modal-foot {
  padding: 14px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-label .dot-warn {
  background: var(--danger);
  box-shadow: none;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/styles.css
git commit -m "feat: add overwrite modal styles, update sidebar grid"
```

---

### Task 4: Add `OverwriteModal` component and refactor `saveFile`

**Files:**
- Modify: `src/renderer/src/App.jsx`

- [ ] **Step 1: Add `overwritePending` state**

In `App()`, after the `const [toast, setToast] = useState(null)` line (line 17), add:

```js
const [overwritePending, setOverwritePending] = useState(null)
```

- [ ] **Step 2: Add `persistSave` helper**

After the `showToast` function definition (after line 157), add:

```js
const persistSave = async (filename, body) => {
  const result = await window.electronAPI.saveFile(filename, body)
  if (!result.success) { showToast(`Save failed: ${result.error}`); return }
  const filled = slots.filter(s => s.code)
  const record = {
    id: uid(),
    n: fileCounter.current++,
    filename,
    company,
    refId,
    stamp: nowStamp(),
    count: filled.length,
    body,
    slots,
  }
  setSavedFiles((prev) => [record, ...prev].slice(0, 40))
  showToast(`Saved → ${filename}`)
}
```

- [ ] **Step 3: Replace `saveFile` with the file-exists-aware version**

Replace the entire `saveFile` function (lines 91–118) with:

```js
const saveFile = async () => {
  const filled = slots.filter(s => s.code)
  if (!filled.length) { showToast('Nothing to save — scan at least one code'); return }
  if (!company.trim() || !refId.trim()) { showToast('Company and ID are required'); return }

  const filename = buildFilename(company, refId)
  const body = formatFileContent(slots, tweaks.trimDigits)

  const exists = await window.electronAPI.fileExists(filename)
  if (exists) {
    setOverwritePending({ filename, body })
    return
  }

  await persistSave(filename, body)
}
```

- [ ] **Step 4: Add `confirmOverwrite` function**

After `saveFile`, add:

```js
const confirmOverwrite = async () => {
  const { filename, body } = overwritePending
  setOverwritePending(null)
  await persistSave(filename, body)
}
```

- [ ] **Step 5: Remove `redownload` function**

Delete the `redownload` function entirely (was lines 124–128):

```js
// DELETE THIS:
const redownload = async (rec) => {
  const result = await window.electronAPI.saveFile(rec.filename, rec.body)
  if (result.success) showToast(`Re-saved → ${rec.filename}`)
  else showToast(`Re-save failed: ${result.error}`)
}
```

- [ ] **Step 6: Wire `OverwriteModal` into the JSX**

In App's return, find the `<Sidebar>` line (line 200) and update it to remove `onRedownload`:

```jsx
<Sidebar savedFiles={savedFiles} onOpen={openFile} onDelete={deleteFile} />
```

Then find where `ScanModal` is rendered (line 203) and add the `OverwriteModal` just before the `TweaksPanel` line:

```jsx
{overwritePending && (
  <OverwriteModal
    filename={overwritePending.filename}
    onConfirm={confirmOverwrite}
    onCancel={() => setOverwritePending(null)}
  />
)}
```

So the bottom of the return looks like:

```jsx
      {scanning !== null && (
        <ScanModal
          slotIndex={scanning}
          showPreview={tweaks.showPreview}
          trimDigits={tweaks.trimDigits}
          beepOnScan={tweaks.beepOnScan}
          onComplete={completeScan}
          onCancel={() => setScanning(null)}
        />
      )}

      {overwritePending && (
        <OverwriteModal
          filename={overwritePending.filename}
          onConfirm={confirmOverwrite}
          onCancel={() => setOverwritePending(null)}
        />
      )}

      <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} open={tweaksOpen} onClose={() => setTweaksOpen(false)} />

      {toast && <div key={toast.key} className="toast">{toast.msg}</div>}
    </div>
  )
```

- [ ] **Step 7: Add the `OverwriteModal` component**

At the bottom of `App.jsx`, after the `Sidebar` function, add:

```jsx
function OverwriteModal({ filename, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-label">
            <span className="dot dot-warn" />
            FILE ALREADY EXISTS
          </span>
        </div>
        <div className="modal-body">
          <div className="ow-msg">A file with this name already exists on disk:</div>
          <div className="ow-filename">{filename}</div>
          <div className="ow-sub">Saving will replace it with the current scan data.</div>
        </div>
        <div className="modal-foot">
          <button className="ghost-btn" onClick={onCancel}>CANCEL</button>
          <button className="primary-btn" onClick={onConfirm}>OVERWRITE</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Update `Sidebar` to remove `onRedownload`**

Find the `Sidebar` function signature (line 372) and remove `onRedownload`:

```jsx
function Sidebar({ savedFiles, onOpen, onDelete }) {
```

Then inside `Sidebar`, find the `side-item` div and remove the `si-dl` button div entirely. The item should become:

```jsx
<div key={rec.id} className="side-item" onClick={() => onOpen(rec)}>
  <div className="si-main">
    <div className="si-title">{rec.company} <span className="sep">·</span> {rec.refId}</div>
    <div className="si-meta">{rec.count} codes <span className="sep">·</span> {rec.stamp}</div>
    <div className="si-file">{rec.filename}</div>
  </div>
  <div className="si-del" onClick={(e) => { e.stopPropagation(); onDelete(rec) }}><Icon.X size={12}/></div>
</div>
```

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/App.jsx
git commit -m "feat: add overwrite confirmation modal, remove redownload button"
```

---

### Task 5: Verify in the running app

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test — saving a new file (no overwrite)**
  1. Enter a Company and Ref/ID that has not been saved before.
  2. Scan at least one slot.
  3. Click SAVE FILE.
  4. Expected: file saves immediately, toast appears, no modal shown.

- [ ] **Step 3: Test — overwrite confirmation**
  1. Use the same Company and Ref/ID as Step 2 (file already exists on disk).
  2. Scan a slot (may be different codes).
  3. Click SAVE FILE.
  4. Expected: the `OverwriteModal` appears showing the filename.
  5. Click CANCEL — modal closes, nothing is saved.
  6. Click SAVE FILE again, then click OVERWRITE — modal closes, file is saved, toast appears.

- [ ] **Step 4: Test — backdrop click cancels**
  1. Trigger the overwrite modal.
  2. Click the dark backdrop area outside the modal card.
  3. Expected: modal closes, nothing saved.

- [ ] **Step 5: Test — sidebar has no re-download button**
  1. Open a saved file from the sidebar.
  2. Confirm only the delete (×) icon is visible; no download icon.

- [ ] **Step 6: Test — theme consistency**
  1. Open Tweaks and switch between Light, Terminal, Blueprint, and Paper themes.
  2. Trigger the overwrite modal in each theme.
  3. Expected: modal background, text, and buttons follow the active theme's colour variables correctly.
