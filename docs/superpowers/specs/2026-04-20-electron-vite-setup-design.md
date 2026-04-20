# Trim Code — Electron + Vite Desktop App Design

**Date:** 2026-04-20  
**Status:** Approved

## Overview

Convert the existing Trim Code Injector Scanner (React 18 + Babel Standalone, CDN-loaded) into a functional Electron desktop utility app for personal use. Vite handles bundling via the `electron-vite` toolchain. The existing component logic and CSS design are preserved entirely; only the module system and save mechanism change.

---

## Project Structure

Scaffold using `electron-vite` in the current repo directory. Existing files are migrated into the new layout.

```
TrimCode/
├── electron.vite.config.js
├── package.json
├── README.md
├── docs/
│   └── superpowers/specs/
│       └── 2026-04-20-electron-vite-setup-design.md
├── scraps/                         (unchanged, kept for reference)
└── src/
    ├── main/
    │   └── index.js                # Electron main process
    ├── preload/
    │   └── index.js                # contextBridge IPC bridge
    └── renderer/
        ├── index.html              # replaces "Trim Code.html"
        └── src/
            ├── main.jsx            # React root (ReactDOM.createRoot)
            ├── App.jsx             # migrated from app_main.jsx
            ├── ScanModal.jsx       # migrated from scan_modal.jsx
            ├── Tweaks.jsx          # migrated from tweaks.jsx
            ├── utils.js            # migrated from utils.jsx
            └── styles.css          # unchanged
```

The original `Trim Code.html` and `src/` flat files are replaced by this structure. Git history is preserved (same repo, no re-init).

---

## Module Migration

Each JSX file is converted from CDN-globals style to ES modules:

- Remove `const { useState, useEffect, ... } = React` globals at the top of each file
- Add `import React, { useState, useEffect, ... } from 'react'` (or named imports as needed)
- Add `export default` to each component
- Add `import` statements between files (e.g. `App.jsx` imports `ScanModal`, `Tweaks`, `utils`)
- `main.jsx` serves as the entry point: imports `App` and calls `ReactDOM.createRoot`

Google Fonts CDN links in `index.html` are replaced with npm font packages (`@fontsource/jetbrains-mono`, `@fontsource/inter`) imported in `main.jsx`, so the app works fully offline.

---

## Electron Main Process (`src/main/index.js`)

Responsibilities:
1. Create a `BrowserWindow` with `width: 1400` to match the existing viewport setting
2. On startup, ensure `~/Documents/trimcodes/` exists using `fs.mkdirSync({ recursive: true })`
3. Handle `save-file` IPC event: receive `{ filename, content }`, write to `~/Documents/trimcodes/{filename}`, reply with `{ success: true }` or `{ success: false, error: string }`

---

## Preload Bridge (`src/preload/index.js`)

Exposes a single API via `contextBridge`:

```js
window.electronAPI = {
  saveFile: (filename, content) => ipcRenderer.invoke('save-file', { filename, content })
}
```

The renderer is kept sandboxed — no direct Node API access.

---

## File Save Flow

Triggered from the existing save action in `App.jsx` (currently saves to localStorage sidebar). The new flow:

1. User presses Save (existing UI button, unchanged)
2. Renderer builds filename: `{company}{refId}.txt` — e.g. company `ABC`, refId `123` → `ABC123.txt`
3. Renderer builds file content in plain text:
   ```
   [04-20-2026 12:33 AM]
   1 BOSCH-0445120123-7N91
   2 DENSO-095000-5471-AX
   ```
   Timestamp format: `MM-DD-YYYY HH:MM AM/PM`, built using a reformatted `nowStamp()` helper. Numbered lines correspond to slot index + code value, skipping empty slots.
4. Renderer calls `window.electronAPI.saveFile(filename, content)`
5. Main process writes the file; renderer shows success/error toast (using existing toast UI)

localStorage session restore is kept as-is (it's independent of the save-to-disk feature).

---

## Dev Workflow

```bash
npm install
npm run dev       # starts Vite dev server + Electron with HMR
```

## Production Build

```bash
npm run build     # bundles renderer + compiles main/preload into out/
npm run preview   # launches Electron against the built output
```

No installer/packaging is required for personal use. `electron-builder` can be added later if a distributable is ever needed.

---

## Dependencies

| Package | Purpose |
|---|---|
| `electron` | Desktop runtime |
| `electron-vite` | Dev server + build tooling |
| `@vitejs/plugin-react` | JSX transform |
| `@fontsource/jetbrains-mono` | Offline font (replaces CDN) |
| `@fontsource/inter` | Offline font (replaces CDN) |

---

## README

A `README.md` is created at the project root with:
- How to install dependencies (`npm install`)
- How to run in development (`npm run dev`)
- How to build for production (`npm run build` + `npm run preview`)
- Where saved files go (`~/Documents/trimcodes/`)

---

## What Does Not Change

- All CSS (`styles.css`) — zero modifications
- All component logic and theming
- localStorage session restore
- The existing four themes (light, terminal, paper, blueprint)
- The scan modal, tweaks panel, slot behavior
