# Overwrite Confirmation Modal — Design Spec
*2026-04-22*

## Summary

When the user clicks SAVE FILE and the target filename already exists on disk, show a themed in-app confirmation modal before overwriting. The re-download button in the sidebar is removed as part of this change.

---

## Changes by File

### `src/main/index.js`
- Import `existsSync` from `fs` (alongside existing `mkdirSync`, `writeFileSync`).
- Add a new IPC handler `file-exists` that returns `existsSync(join(SAVE_DIR, filename))`.
- The existing `save-file` handler is unchanged.

### `src/preload/index.js`
- Expose `fileExists: (filename) => ipcRenderer.invoke('file-exists', filename)` alongside the existing `saveFile`.

### `src/renderer/src/App.jsx`

**`saveFile` function:**
1. Build `filename` and `body` as before.
2. Call `window.electronAPI.fileExists(filename)`.
3. If `false`: proceed directly to `window.electronAPI.saveFile(...)` (current behaviour).
4. If `true`: store `{ filename, body }` in new state `overwritePending` — this causes the modal to render. Do not save yet.

**`confirmOverwrite` function (new):**
- Called when the user clicks OVERWRITE in the modal.
- Calls `window.electronAPI.saveFile(overwritePending.filename, overwritePending.body)`.
- On success: updates `savedFiles` and shows toast (same as current save path).
- Clears `overwritePending` (hides modal).

**`OverwriteModal` component (new):**
- Renders only when `overwritePending !== null`.
- Structure:
  - `.modal-backdrop` (existing class, full-screen overlay)
  - `.modal.modal-sm` (smaller card, ~480px wide)
    - `.modal-head` with label `FILE ALREADY EXISTS` and a warning dot
    - `.modal-body` showing the filename being overwritten
    - `.modal-foot` with two buttons: `OVERWRITE` (primary/accent) and `CANCEL` (ghost)
- Pressing CANCEL sets `overwritePending` to `null`.
- Clicking the backdrop also cancels.

**Sidebar:**
- Remove the `onRedownload` prop from `<Sidebar>`.
- Remove the `redownload` function from `App`.
- Remove the `si-dl` button div from the `side-item` template inside `Sidebar`.
- Remove the `onRedownload` parameter from the `Sidebar` function signature.

### `src/renderer/src/styles.css`

Add styles for the new modal classes using only existing CSS variables (no hardcoded colours), so they automatically respond to all themes:

```css
.modal-sm { width: min(480px, 92vw); }
.modal-body { padding: 20px; border-bottom: 1px solid var(--line); }
.modal-body .ow-filename { ... }  /* accent-coloured filename */
.modal-foot { padding: 14px 20px; display: flex; justify-content: flex-end; gap: 10px; }
```

The OVERWRITE button reuses `.primary-btn`. The CANCEL button reuses `.ghost-btn`.
The warning dot in `.modal-head` uses `var(--danger)` instead of `var(--accent)`.

---

## Data Flow

```
User clicks SAVE FILE
  → fileExists(filename) via IPC
    → false → saveFile() → toast
    → true  → setOverwritePending({ filename, body }) → OverwriteModal renders
                → CANCEL → setOverwritePending(null)
                → OVERWRITE → saveFile() → toast → setOverwritePending(null)
```

---

## Out of Scope
- No confirmation for re-download (button removed entirely).
- No change to the `newFile` or `openFile` confirm flow (they keep using `confirm()`).
- No filename deduplication or auto-rename logic.
