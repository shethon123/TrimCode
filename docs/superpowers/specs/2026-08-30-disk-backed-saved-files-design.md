# Disk-Backed Saved Files Sidebar — Design

**Date:** 2026-08-30
**Status:** Approved for planning

## Problem

The SAVED FILES sidebar maintains its own in-app list of saved files as React
state persisted to `localStorage` (`trimcode:session` → `savedFiles`,
`fileCounter`). The list only reflects files this app instance saved during its
own session. Files added, renamed, or deleted on disk by any other means are
invisible, and the sidebar's "remove" action only drops the row — the `.txt`
file stays on disk.

## Goal

Make the `trimcodes` directory on disk the single source of truth for the
sidebar. The app scans it on launch, watches it for external changes, reflects
adds/renames/deletes live, and its remove action moves the real file to the
system trash.

## Decisions (locked)

- **File header replaces the timestamp line.** The first line of each `.txt`
  becomes `# <COMPANY> | <REF>`. The previous `[MM-DD-YYYY HH:MM AM/PM]` first
  line is removed entirely.
- **Watcher uses Node's built-in `fs.watch`.** No new dependency. One flat
  directory; rename-detection weaknesses are covered by a full re-scan on every
  event plus a 300ms debounce.
- **Directory stays fixed at `~/Documents/trimcodes`,** routed through one
  `saveDir` module so a configurable path can be added later without touching
  the scanner or watcher. No settings UI in this work.
- **Empty-slot lines (`N ` with no code) are still written,** preserving slot
  positions on re-open. The code count treats a line with no token after the
  leading number as empty.
- **In-app save/trash also trigger an immediate re-scan** (one call each), since
  it is a single function call. The watcher still covers external changes; its
  later event coalesces into a no-op.
- **"Reveal in file manager" is a single sidebar-header button** that opens the
  `trimcodes` folder itself (not per-row).

## Architecture

### Main process module layout

`src/main/index.js` is split so each unit has one purpose:

- **`src/main/saveDir.js`**
  - `SAVE_DIR` — `join(homedir(), 'Documents', 'trimcodes')`.
  - `ensureSaveDir()` — `mkdirSync(SAVE_DIR, { recursive: true })`.
  - `safeResolve(name)` — rejects `name` containing path separators or `..`,
    returns the absolute path inside `SAVE_DIR`. Throws on violation. Every
    filename received over IPC passes through this.
- **`src/main/savedFilesStore.js`** — the scanner, the `fs.watch` watcher, the
  debounce, and the broadcast. Public API:
  - `initSavedFilesStore(getWindow)` — creates the watcher and runs a first
    `scanAndBroadcast()`. `getWindow` is a `() => BrowserWindow | null`. Wiring
    `win.on('focus', ...)` is the caller's job (`index.js`).
  - `scanAndBroadcast()` — runs `scan()`, sends the result to the renderer,
    returns the result. Safe to call directly (focus, post-save, post-trash,
    `list-saved-files` IPC).
  - `dispose()` — closes the watcher and clears any pending debounce timer.
- **`src/main/index.js`** — `BrowserWindow` creation, `ensureSaveDir()` on
  ready, `initSavedFilesStore(() => BrowserWindow.getAllWindows()[0] ?? null)`,
  `win.on('focus', scanAndBroadcast)`, IPC handler registration, `dispose()` on
  `will-quit`.

### Scanner — `scan()`

Async, uses `fs.promises`. Returns one of:

- `{ ok: true, files: SavedFileRecord[] }`
- `{ ok: false, error: string }`

`SavedFileRecord = { name, mtimeMs, company, refId, count, hasHeader }`.

Steps:

1. `readdir(SAVE_DIR, { withFileTypes: true })`.
   - On `ENOENT`: call `ensureSaveDir()` once and retry the `readdir` once.
   - On any other error (`EACCES`, `ENOTDIR`, missing drive, still `ENOENT`
     after retry): return `{ ok: false, error: err.message }`.
2. Filter entries: `entry.isFile()`, name ends with `.txt` (case-insensitive),
   name does not start with `.`.
3. `stat` each candidate with a **concurrency cap of 8** (`CONCURRENCY = 8`).
   Drop any whose `size > 1_000_000` (`MAX_BYTES = 1_000_000`). Collect
   `{ name, path, mtimeMs }`.
4. Read each surviving file (`readFile(path, 'utf8')`, same cap of 8) and run
   `parseSavedFile(text, name)` to obtain `company` / `refId` / `count` /
   `hasHeader`. A per-file read error drops that one file from the list (the
   scan as a whole still succeeds).
5. Sort by `mtimeMs` descending (newest first).
6. Return `{ ok: true, files }`.

A tiny inline promise-pool (map with a running window of `CONCURRENCY`) covers
steps 3 and 4 — no dependency. Hundreds of sub-1 MB files stay well under a
frame's worth of main-process time because every fs call is async.

### Watcher

- `fs.watch(SAVE_DIR, { persistent: true }, () => scheduleScan())`.
- `scheduleScan()` — `clearTimeout(timer)`; `timer = setTimeout(scanAndBroadcast, 300)`
  (`DEBOUNCE_MS = 300`).
- On the watcher's async `'error'` event, `handleWatcherError()` closes and
  nulls the watcher handle, then calls `scanAndBroadcast().catch(() => {})`
  (which will report `{ ok:false }` if the directory is now unreadable). The
  watcher is re-created lazily at the start of the next `scanAndBroadcast()`
  call if it is missing.
- On a **synchronous** throw from `fs.watch(...)` inside `startWatcher()`, the
  `catch` only logs and leaves `watcher = null`. It must **not** call
  `handleWatcherError` or `scanAndBroadcast` — doing so recurses without bound
  when the directory is missing (fixed in commit 2c2301e). The next
  `scanAndBroadcast()` triggered by any other path re-arms the watcher.
- `scanAndBroadcast()` re-arms the watcher only **after** `await scan()`, so
  `scan()`'s `ENOENT` branch can recreate the directory first. It also carries
  a monotonic sequence guard (`scanSeq`): only the newest scan broadcasts, so a
  slower earlier scan cannot push a stale list.
- `dispose()` closes the watcher and clears the timer.

### Focus + in-app re-scan

- `win.on('focus', () => { scanAndBroadcast() })` — immediate, no debounce.
- `save-file` handler: after a successful `writeFileSync`, call
  `scanAndBroadcast()` before returning.
- `trash-file` handler: after a successful `shell.trashItem`, call
  `scanAndBroadcast()` before returning.

### IPC surface

Registered in `src/main/index.js`, exposed in `src/preload/index.js` as
`window.electronAPI`:

| method | mechanism | behavior |
|---|---|---|
| `saveFile(filename, content)` | `invoke` | unchanged write via `safeResolve`; then `scanAndBroadcast()`; returns `{ success, error? }` |
| `fileExists(filename)` | `invoke` | unchanged (`existsSync` via `safeResolve`) |
| `listSavedFiles()` | `invoke` | `return scanAndBroadcast()` — used on renderer mount and by the manual refresh button |
| `readSavedFile(filename)` | `invoke` | `{ ok: true, content }` or `{ ok: false, error }`; `safeResolve` |
| `trashFile(filename)` | `invoke` | `shell.trashItem(safeResolve(filename))`; then `scanAndBroadcast()`; `{ ok: true }` or `{ ok: false, error }` |
| `revealSaveDir()` | `invoke` | `shell.openPath(SAVE_DIR)` (creates via `ensureSaveDir()` first) |
| `onSavedFilesUpdate(cb)` | `on` / return unsub | subscribes to `'saved-files:update'`; returns a function that removes the listener |

`onSavedFilesUpdate` in preload wraps `ipcRenderer.on('saved-files:update', (_e, payload) => cb(payload))`
and returns `() => ipcRenderer.removeListener(...)`. The wrapped listener must
not forward the raw `IpcRendererEvent`.

## File format & parsing (`src/renderer/src/utils.jsx`)

### New `.txt` layout

```
# NORTHGATE DIESEL | WO-2026-04-081
1 BOSCH-0445120123-7N91
2 
3 DENSO-095000-5471-AX
```

- Line 1: `# ${company} | ${refId}`. `company` and `refId` are already required
  before save is enabled, so the header is always fully populated on save.
- Lines 2..N: one per slot — `${i + 1} ${code}` for a filled slot,
  `${i + 1} ` (number, space, nothing) for an empty slot. Raw codes, no
  trimming.

### `formatFileContent(company, refId, slots)`

Signature changes from `formatFileContent(slots, trimDigits)`. Returns the
string above. No timestamp line. `App.jsx`'s call site
(`formatFileContent(slots, tweaks.trimDigits)`) updates to
`formatFileContent(company, refId, slots)`.

### `parseSavedFile(text, filename)` → `{ company, refId, count, hasHeader }`

- Split on `/\r?\n/`.
- If line 0 matches `/^#\s*(.*?)\s*\|\s*(.*)$/`:
  `company` = group 1 trimmed, `refId` = group 2 trimmed, `hasHeader = true`.
- Else: `company` = `filename` with a trailing `.txt` removed, `refId = ''`,
  `hasHeader = false`. (No line is treated as the header in this case.)
- `count` = number of lines for which **all** hold:
  - not blank (after trim),
  - does not start with `#`,
  - after removing a leading `/^\s*\d+\s*/` prefix, at least one non-whitespace
    character remains.

  This counts `1 CODE` and a bare `CODE` line; it does not count `2 `, `# ...`,
  or an empty line.

### `parseCodeLines(text)` → `[{ idx, code }]`

- Split on `/\r?\n/`, drop lines starting with `#`.
- For each remaining line matching `/^(\d+)\s+(.+)$/`, push
  `{ idx: Number(g1) - 1, code: g2.trim() }` when `code` is non-empty.
- Used by `openFile` to rebuild slots, replacing the inline `slice(1)` + regex.

### Deletions

- `nowStampFile` — remove (only consumer was `formatFileContent`).
- `nowStamp` — remove (only consumer was the sidebar record's `stamp`, which is
  gone).

## Renderer (`src/renderer/src/App.jsx`)

### Session persistence

`trimcode:session` load and save keep `company`, `refId`, `slots`. Remove
`savedFiles` and `fileCounter` from both the read effect and the write effect.
`const fileCounter = useRef(1)` is deleted.

### State

- `savedFiles` — `SavedFileRecord[]`, default `[]`. Sourced only from the main
  process.
- `savedFilesError` — `string | null`, default `null`.

A single `applyUpdate` handler, defined at component scope with `useCallback`,
is shared by the mount effect and the sidebar's refresh/retry action:

```
const applyUpdate = useCallback((res) => {
  if (res.ok) { setSavedFiles(res.files); setSavedFilesError(null) }
  else { setSavedFilesError(res.error || 'Could not read the trimcodes folder') }
}, [])

const refreshSavedFiles = useCallback(() => {
  window.electronAPI.listSavedFiles().then(applyUpdate)
}, [applyUpdate])

useEffect(() => {
  refreshSavedFiles()
  const unsub = window.electronAPI.onSavedFilesUpdate(applyUpdate)
  return unsub
}, [refreshSavedFiles, applyUpdate])
```

`refreshSavedFiles` is passed to `<Sidebar>` as `onRefresh` and reused for the
error block's RETRY button. On an error result the previous `savedFiles` list
is left as-is behind the error block (see Sidebar); a later successful result
clears the error and replaces the list.

### `persistSave(filename, body)`

Drops the record-building block and `setSavedFiles(...)`. Becomes: call
`window.electronAPI.saveFile(filename, body)`, on `!result.success` show the
failure toast, otherwise show `Saved → ${filename}`. The new row arrives via
the post-save `scanAndBroadcast()` push.

### `deleteFile(rec)`

Renamed intent: opens a confirmation modal rather than mutating state.

- `setTrashPending(rec)` → renders `ConfirmTrashModal` (new component, same
  shape as `OverwriteModal` / `NewFileModal`).
- Modal copy: label `MOVE FILE TO TRASH`, body line
  `Move ${rec.name} to Trash?`, buttons `CANCEL` / `MOVE TO TRASH`.
- Confirm → `await window.electronAPI.trashFile(rec.name)`; on
  `{ ok: false }` show a `Trash failed: ${error}` toast. No local list
  mutation — the post-trash `scanAndBroadcast()` push removes the row.
- New state: `trashPending` (`SavedFileRecord | null`).

### `openFile(rec)`

- Keep the unsaved-scans `confirm(...)` guard as-is (out of scope).
- `const res = await window.electronAPI.readSavedFile(rec.name)`; on
  `!res.ok` show a toast and return.
- `setCompany(rec.company)`, `setRefId(rec.hasHeader ? rec.refId : '')`.
- Build slots from `parseCodeLines(res.content)`:
  `count = Math.max(tweaks.slotCount, maxIdx + 1)`, `EMPTY_SLOTS(count)`, then
  place each `{ idx, code }` with `scannedAt: Date.now()`.
- Toast `Opened ${rec.name}`.
- The `rec.slots` fast path is removed — disk is the only source.

### `<Sidebar>` props

`savedFiles`, `onOpen`, `onDelete`, plus new: `error` (`savedFilesError`),
`onRefresh` (`refreshSavedFiles` from `App`), `onReveal`
(`() => window.electronAPI.revealSaveDir()`).

## Renderer (`Sidebar` component)

- **Header row:** `SAVED FILES` label + count, then two icon buttons:
  - refresh — `Icon.Refresh` (new), `onClick={onRefresh}`, title "Rescan folder".
  - reveal — `Icon.Folder`, `onClick={onReveal}`, title "Open folder".
- **Error state:** when `error` is truthy, the search box + list + empty states
  are replaced by an inline block:
  - icon, title `FOLDER UNAVAILABLE`, the `error` message,
  - a `RETRY` button (`ghost-btn`) calling `onRefresh`.
  The footer stays visible.
- **List:** unchanged structure. Rows keyed by `rec.name`. `si-title` shows
  `rec.company · rec.refId` when `rec.hasHeader`, otherwise `rec.name`.
  `si-meta` shows `${rec.count} codes`. `si-file` shows `rec.name`.
- **Search:** `normalizeSearch` matching over `rec.company`, `rec.refId`, and
  `rec.name` (so headerless files are still findable by filename).
- **Per-row remove:** `si-del` stays; `onClick` calls `onDelete(rec)` (which now
  opens the confirm modal). No per-row reveal button.
- Empty state (`savedFiles.length === 0` and no error) unchanged.

### New icon

`Icon.Refresh` in `utils.jsx` — a circular-arrow glyph, same
`svg width/height/viewBox/stroke` conventions as the other icons.

## Removed / changed inventory

| Item | Change |
|---|---|
| `localStorage` `trimcode:session.savedFiles` | no longer written or read |
| `localStorage` `trimcode:session.fileCounter` | no longer written or read |
| `fileCounter` ref, `record.n` | deleted |
| `record.stamp`, `record.body`, `record.slots`, `record.id` | gone — records come from disk as `SavedFileRecord` |
| `nowStamp`, `nowStampFile` (`utils.jsx`) | deleted |
| `formatFileContent` signature | `(slots, trimDigits)` → `(company, refId, slots)` |
| file first line | `[timestamp]` → `# COMPANY | REF` |
| `src/main/index.js` | split into `saveDir.js` + `savedFilesStore.js` + wiring |

## Error handling summary

| Situation | Behavior |
|---|---|
| Directory missing on launch | `ensureSaveDir()` creates it; scan proceeds |
| Directory unreadable (perms, missing drive) | `scan()` returns `{ ok:false, error }`; sidebar shows the error block + RETRY; app does not crash and does not show a misleading empty list |
| `fs.watch` errors at runtime | broadcast an error result, drop the watcher handle, re-create on next `scanAndBroadcast()` |
| Single file unreadable during scan | that file is omitted; the scan still succeeds |
| Non-`.txt`, dotfile, or `> 1 MB` file present | ignored by the filter |
| `trashFile` fails | `{ ok:false, error }` → `Trash failed: …` toast; list unchanged |
| IPC filename with `..` or a separator | `safeResolve` throws; handler returns an error result |

## Testing

### Unit (vitest + jsdom)

The format helpers and their tests live in `src/shared/savedFileFormat.js` and
`src/shared/savedFileFormat.test.js` (`src/renderer/src/utils.jsx` re-exports
them). `src/main/savedFilesStore.js` now has `scan()`-level unit coverage in
`src/main/savedFilesStore.test.js` — an exported `scanDir(dir)` seam is driven
against a temp directory to cover the filter, the size cap, mtime sort order,
and the record shape.

- `formatFileContent`
  - line 0 is `# ${company} | ${refId}`.
  - filled slots render `N CODE`, empty slots render `N ` (number + single
    trailing space), all positions present.
  - raw code is written regardless of any trim setting.
  - existing timestamp assertions are replaced by header assertions.
- `parseSavedFile`
  - header line parsed into `company` / `refId`, `hasHeader: true`.
  - no header → `company` = filename without `.txt`, `refId` = `''`,
    `hasHeader: false`.
  - `count` ignores the header, `#` comment lines, blank lines, and `N ` empty
    slots; counts `N CODE` and bare `CODE` lines.
  - CRLF (`\r\n`) input parses the same as LF.
- `parseCodeLines`
  - extracts `{ idx, code }` pairs, `idx` zero-based.
  - skips `#` lines, empty-slot lines, and blank lines.
- `normalizeSearch` — unchanged, keep existing tests.

### Manual (real app — `npm run dev`)

jsdom is not a substitute for the running app here. Verify:

1. Launch with existing `.txt` files present → sidebar lists them, newest
   (by mtime) first, with company/ref/count from the header.
2. Add a `.txt` in the folder from a file manager → row appears within ~300ms.
3. Rename a file externally → old row disappears, new one appears.
4. Delete a file externally → row disappears.
5. Drop a `.md`, a dotfile, and a `> 1 MB` `.txt` in the folder → none appear.
6. Save from the app → row appears effectively immediately.
7. Sidebar remove → "Move X.txt to Trash?" modal → confirm → file is in the OS
   trash (recoverable), row gone.
8. Header refresh button → list reconciles. Header reveal button → the folder
   opens in the OS file manager.
9. `chmod 000` the folder (or point `SAVE_DIR` at an unreadable path) →
   sidebar shows the error block; `chmod` back + RETRY → list returns.
10. Open a headerless `.txt` → lists by filename; opening it fills slots
    sequentially from its numbered lines.

## Out of scope

- Configurable save directory / settings UI.
- Replacing the native `confirm()` in `openFile`.
- Any change to the scan/scanning slot workflow.
- Watching nested directories.
