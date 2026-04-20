# Trim Code — Electron + Vite Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing CDN-based React app into a fully bundled Electron desktop utility that saves `.txt` files to `~/Documents/trimcodes/`.

**Architecture:** Scaffold an `electron-vite` project in the existing repo, migrate the four JSX source files from globals-based script ordering to ES modules, wire a new IPC channel for disk saves, and keep all CSS and component logic untouched.

**Tech Stack:** Electron 35, electron-vite 3, Vite + @vitejs/plugin-react, React 18, @fontsource/jetbrains-mono, @fontsource/inter, vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `package.json` | Scripts, deps |
| Create | `electron.vite.config.js` | Vite config for main + renderer |
| Create | `vitest.config.js` | Test runner config |
| Create | `README.md` | Dev/build instructions |
| Create | `src/main/index.js` | Electron main process, IPC handler, dir creation |
| Create | `src/preload/index.js` | contextBridge: exposes `window.electronAPI.saveFile` |
| Create | `src/renderer/index.html` | HTML shell (no CDN scripts) |
| Create | `src/renderer/src/main.jsx` | React root entry, font + CSS imports |
| Create | `src/renderer/src/utils.jsx` | ES module rewrite of `src/utils.jsx` + new `nowStampFile`, `buildFilename`, `formatFileContent` |
| Create | `src/renderer/src/utils.test.jsx` | Vitest tests for the three new utility functions |
| Create | `src/renderer/src/ScanModal.jsx` | ES module rewrite of `src/scan_modal.jsx` |
| Create | `src/renderer/src/Tweaks.jsx` | ES module rewrite of `src/tweaks.jsx` |
| Create | `src/renderer/src/App.jsx` | ES module rewrite of `src/app_main.jsx`, new save flow |
| Copy   | `src/renderer/src/styles.css` | Verbatim copy of `src/styles.css` |

Old files (`Trim Code.html`, `src/utils.jsx`, `src/scan_modal.jsx`, `src/tweaks.jsx`, `src/app_main.jsx`, `src/entry.jsx`, `src/styles.css`) are moved to `scraps/` in the final cleanup task.

---

## Task 1: Initialize project structure and install dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "trim-code",
  "version": "1.0.0",
  "description": "Injector barcode scanner desktop utility",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^35.0.0",
    "electron-vite": "^3.1.0",
    "jsdom": "^26.1.0",
    "vitest": "^3.1.0"
  },
  "dependencies": {
    "@fontsource/inter": "^5.1.1",
    "@fontsource/jetbrains-mono": "^5.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}
```

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p src/main src/preload src/renderer/src
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors. Electron download may take a minute.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: initialize electron-vite project"
```

---

## Task 2: Create vitest config

**Files:**
- Create: `vitest.config.js`

- [ ] **Step 1: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add vitest.config.js
git commit -m "chore: add vitest config"
```

---

## Task 3: Write failing tests for new utility functions

**Files:**
- Create: `src/renderer/src/utils.test.jsx`

These test three functions that do not exist yet. Running them must fail.

- [ ] **Step 1: Create `src/renderer/src/utils.test.jsx`**

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildFilename, formatFileContent } from './utils'

describe('buildFilename', () => {
  it('concatenates company and refId with .txt extension', () => {
    expect(buildFilename('ABC', '123')).toBe('ABC123.txt')
  })

  it('preserves all characters including hyphens', () => {
    expect(buildFilename('NORTHGATE', 'WO-081')).toBe('NORTHGATEWO-081.txt')
  })
})

describe('formatFileContent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // April 20 2026 12:33 PM
    vi.setSystemTime(new Date(2026, 3, 20, 12, 33, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('writes timestamp on first line in MM-DD-YYYY HH:MM AM/PM format', () => {
    const slots = [{ id: '1', code: 'ABCDEF', scannedAt: Date.now() }]
    const content = formatFileContent(slots, 6)
    expect(content.split('\n')[0]).toBe('[04-20-2026 12:33 PM]')
  })

  it('numbers filled slots sequentially and skips empty slots', () => {
    const slots = [
      { id: '1', code: 'ABCDEF', scannedAt: Date.now() },
      { id: '2', code: null, scannedAt: null },
      { id: '3', code: 'GHIJKL', scannedAt: Date.now() },
    ]
    const content = formatFileContent(slots, 6)
    const lines = content.split('\n')
    expect(lines[1]).toBe('1 ABCDEF')
    expect(lines[2]).toBe('2 GHIJKL')
    expect(lines).toHaveLength(3)
  })

  it('applies trimRight to codes longer than trimDigits', () => {
    const slots = [{ id: '1', code: 'BOSCH-0445120123-7N91', scannedAt: Date.now() }]
    const content = formatFileContent(slots, 4)
    const lines = content.split('\n')
    // last 4 chars of 'BOSCH-0445120123-7N91' = '7N91'
    expect(lines[1]).toBe('1 7N91')
  })

  it('returns only timestamp line when all slots are empty', () => {
    const slots = [
      { id: '1', code: null, scannedAt: null },
      { id: '2', code: null, scannedAt: null },
    ]
    const content = formatFileContent(slots, 6)
    expect(content.split('\n')).toHaveLength(1)
    expect(content).toBe('[04-20-2026 12:33 PM]')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: FAIL with `Cannot find module './utils'` or `buildFilename is not a function`.

---

## Task 4: Migrate utils.jsx to ES module with new functions

**Files:**
- Create: `src/renderer/src/utils.jsx`

This is the ES module rewrite of `src/utils.jsx`. It adds `nowStampFile`, `buildFilename`, and `formatFileContent`. All existing logic is preserved verbatim — only the module system changes.

- [ ] **Step 1: Create `src/renderer/src/utils.jsx`**

```jsx
import React from 'react'

export const TWEAK_DEFAULTS = {
  layout: 'grid',
  theme: 'light',
  showPreview: true,
  trimDigits: 6,
  autoCopy: false,
  beepOnScan: true,
  slotCount: 6,
}

export const uid = () => Math.random().toString(36).slice(2, 10)
const pad2 = (n) => String(n).padStart(2, '0')

export const nowStamp = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function nowStampFile() {
  const d = new Date()
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const yyyy = d.getFullYear()
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  const min = pad2(d.getMinutes())
  return `${mm}-${dd}-${yyyy} ${h}:${min} ${ampm}`
}

export const trimRight = (s, n) => (s && s.length > n ? s.slice(-n) : s || '')

export function buildFilename(company, refId) {
  return `${company}${refId}.txt`
}

export function formatFileContent(slots, trimDigits) {
  const lines = [`[${nowStampFile()}]`]
  let n = 1
  for (const slot of slots) {
    if (slot.code) {
      lines.push(`${n} ${trimRight(slot.code, trimDigits)}`)
      n++
    }
  }
  return lines.join('\n')
}

const FAKE_CODES = [
  'BOSCH-0445120123-7N91',
  'DENSO-095000-5471-AX',
  'DELPHI-28236381-R402',
  'SIEMENS-5WS40156-Z',
  'BOSCH-0445110183-M84',
  'DENSO-23670-0L090-KA',
  'VDO-A2C59513554-P12',
  'BOSCH-0445120212-JJ7',
  'CUMMINS-4088723-CR-9',
  'DELPHI-EJBR04701D-Q3',
]

export function fakeScan() {
  const base = FAKE_CODES[Math.floor(Math.random() * FAKE_CODES.length)]
  const suffix = Math.floor(100000 + Math.random() * 900000)
  return `${base}-${suffix}`
}

let _audioCtx = null
export function beep(freq = 880, dur = 0.08) {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    const osc = _audioCtx.createOscillator()
    const gain = _audioCtx.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    gain.gain.value = 0.04
    osc.connect(gain).connect(_audioCtx.destination)
    osc.start()
    osc.stop(_audioCtx.currentTime + dur)
  } catch (e) {}
}

export function BarcodePreview({ value, width = 180, height = 36, color }) {
  if (!value) return null
  const bars = []
  let x = 2
  let i = 0
  while (x < width - 2 && i < value.length * 3) {
    const ch = value.charCodeAt(i % value.length) + i
    const w = 1 + (ch % 4)
    const on = (ch % 3) !== 0
    if (on) bars.push({ x, w })
    x += w + 1
    i++
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {bars.map((b, k) => (
        <rect key={k} x={b.x} y={2} width={b.w} height={height - 12} fill={color || 'currentColor'} />
      ))}
      <text x={width / 2} y={height - 2} textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono, monospace" fill={color || 'currentColor'} opacity="0.75" letterSpacing="1">
        {trimRight(value, 10)}
      </text>
    </svg>
  )
}

export const Icon = {
  Barcode: ({ size = 22, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <path d="M3 5v14M6 5v14M8 5v14M11 5v14M13 5v14M16 5v14M18 5v14M21 5v14" />
    </svg>
  ),
  Scan: ({ size = 22, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M20 8V6a2 2 0 0 0-2-2h-2" />
      <path d="M4 16v2a2 2 0 0 0 2 2h2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M3 12h18" stroke={color} strokeWidth="2" />
    </svg>
  ),
  Camera: ({ size = 22, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <path d="M3 8h3l2-3h8l2 3h3v11H3z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Copy: ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </svg>
  ),
  Check: ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2">
      <path d="M4 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  X: ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  ),
  Plus: ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Download: ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M12 3v13M6 11l6 6 6-6M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Folder: ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  Sliders: ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="15" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="17" cy="18" r="2" />
    </svg>
  ),
}
```

- [ ] **Step 2: Run tests — verify they pass**

```bash
npm test
```

Expected: all 5 tests PASS, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/utils.jsx src/renderer/src/utils.test.jsx
git commit -m "feat: add utils ES module with formatFileContent, buildFilename, nowStampFile"
```

---

## Task 5: Create electron.vite.config.js

**Files:**
- Create: `electron.vite.config.js`

- [ ] **Step 1: Create `electron.vite.config.js`**

```js
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add electron.vite.config.js
git commit -m "chore: add electron-vite config"
```

---

## Task 6: Create renderer index.html

**Files:**
- Create: `src/renderer/index.html`

- [ ] **Step 1: Create `src/renderer/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Trim Code — Injector Scanner</title>
  <meta name="viewport" content="width=1400" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    :root, body[data-theme="light"] {
      --bg: #f6f7f5; --panel: #ffffff; --panel-2: #f0f2ee; --line: #e3e6df;
      --line-2: #c8ccc2; --fg: #0a0f0a; --fg-dim: #36402f; --fg-mute: #6b7264;
      --accent: #1f9c4a; --accent-dim: #15733a; --accent-glow: rgba(31,156,74,0.12);
      --danger: #c93030; --warn: #b88510;
    }
    body[data-theme="terminal"] {
      --bg: #0a0c0a; --panel: #0f1410; --panel-2: #141a15; --line: #1e2820;
      --line-2: #2a3a2e; --fg: #d8e4d8; --fg-dim: #7a8a7e; --fg-mute: #4a5a4e;
      --accent: #3ee07a; --accent-dim: #2a9a54; --accent-glow: rgba(62,224,122,0.12);
      --danger: #ff5a5a; --warn: #e8c547;
    }
    body[data-theme="paper"] {
      --bg: #f1ece1; --panel: #faf6ec; --panel-2: #ebe4d2; --line: #d6cdb8;
      --line-2: #b8ad92; --fg: #2a2620; --fg-dim: #6b6352; --fg-mute: #a39a85;
      --accent: #c8471a; --accent-dim: #9a3412; --accent-glow: rgba(200,71,26,0.08);
    }
    body[data-theme="blueprint"] {
      --bg: #0a1420; --panel: #0f1d2e; --panel-2: #15263a; --line: #1e3350;
      --line-2: #2a4868; --fg: #d8e4f0; --fg-dim: #7a8ca8; --fg-mute: #4a5a70;
      --accent: #5aa0ff; --accent-dim: #3a7ad0; --accent-glow: rgba(90,160,255,0.12);
    }
  </style>
</head>
<body data-theme="light">
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat: add renderer HTML shell"
```

---

## Task 7: Migrate ScanModal

**Files:**
- Create: `src/renderer/src/ScanModal.jsx`

Convert `src/scan_modal.jsx` from globals to ES module. Logic is identical — only the hook declarations and exports change.

- [ ] **Step 1: Create `src/renderer/src/ScanModal.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { trimRight, fakeScan, beep, Icon } from './utils'

export default function ScanModal({ slotIndex, onComplete, onCancel, showPreview, trimDigits, beepOnScan }) {
  const [phase, setPhase] = useState('aiming')
  const [code, setCode] = useState('')
  const [progress, setProgress] = useState(0)
  const [flickerChars, setFlickerChars] = useState('')

  useEffect(() => {
    if (phase !== 'aiming') return
    const t0 = performance.now()
    let raf
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 2000)
      setProgress(p)
      const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789-'
      let s = ''
      for (let i = 0; i < 18; i++) s += pool[Math.floor(Math.random() * pool.length)]
      setFlickerChars(s)
      if (p >= 1) {
        const scanned = fakeScan()
        setCode(scanned)
        setPhase('found')
        if (beepOnScan) beep(1200, 0.09)
      } else {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter' && phase === 'found') onComplete(code)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, code])

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-label">
            <span className="dot" /> SCANNING <span className="sep">/</span> SLOT {String(slotIndex + 1).padStart(2, '0')}
          </div>
          <button className="ghost-btn" onClick={onCancel} aria-label="Close">
            <Icon.X /> ESC
          </button>
        </div>

        <div className="viewfinder">
          <div className="radar">
            <span className="ring r1"/><span className="ring r2"/><span className="ring r3"/><span className="ring r4"/>
          </div>

          <div className={`scene ${phase}`}>
            <div className="target">
              <div className="qr">
                {Array.from({ length: 49 }).map((_, i) => {
                  const on = [0,1,2,3,4,5,6,7,13,14,20,21,27,28,34,35,41,42,43,44,45,46,47,48,10,17,24,31,38,23,25,30,32].includes(i % 49)
                  return <span key={i} className={on ? 'on' : ''} />
                })}
                <div className="qr-pulse"/>
                <div className="qr-sweep"/>
              </div>
              <div className="target-label">SCAN TARGET</div>
            </div>
          </div>

          <div className="decoder">
            <div className="dec-label">
              <span className="ind"/>
              DECODING
            </div>
            <div className="dec-stream">
              {phase === 'found' ? code : flickerChars}
            </div>
            {phase === 'found' && <div className="dec-ok"><Icon.Check size={12}/> CODE LOCKED</div>}
          </div>

          <div className="vf-readout">
            <div className="row">
              <span className="k">SIGNAL</span>
              <span className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }}/></span>
              <span className="v">{Math.round(progress * 100)}%</span>
            </div>
            <div className="row">
              <span className="k">MODE</span>
              <span className="v">QR · DataMatrix · Code128</span>
            </div>
            <div className="row">
              <span className="k">STATUS</span>
              <span className="v">{phase === 'aiming' ? 'SEARCHING…' : 'LOCKED'}</span>
            </div>
          </div>

          {phase === 'found' && (
            <div className="lock-badge"><Icon.Check size={18}/> LOCKED</div>
          )}
        </div>

        {phase === 'found' && (
          <div className="scan-result">
            <div className="res-left">
              <div className="res-label">DETECTED</div>
              <div className="res-code">{code}</div>
              <div className="res-trim">
                TRIM <span className="arrow">→</span> <b>{trimRight(code, trimDigits)}</b>
              </div>
            </div>
            <div className="res-actions">
              <button className="ghost-btn" onClick={() => { setPhase('aiming'); setProgress(0); setCode('') }}>
                RESCAN
              </button>
              <button className="primary-btn" onClick={() => onComplete(code)}>
                <Icon.Check/> ACCEPT <span className="kbd">↵</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/ScanModal.jsx
git commit -m "feat: migrate ScanModal to ES module"
```

---

## Task 8: Migrate Tweaks panel

**Files:**
- Create: `src/renderer/src/Tweaks.jsx`

Convert `src/tweaks.jsx`. The `window.parent.postMessage` edit-mode call is removed — it was Claude's design-tool integration and has no purpose in Electron.

- [ ] **Step 1: Create `src/renderer/src/Tweaks.jsx`**

```jsx
import { Icon } from './utils'

export default function TweaksPanel({ tweaks, setTweaks, open, onClose }) {
  if (!open) return null

  const patch = (k, v) => setTweaks({ ...tweaks, [k]: v })

  return (
    <div className="tweaks">
      <div className="tweaks-head">
        <span><Icon.Sliders/> TWEAKS</span>
        <button className="ghost-btn ghost-sm" onClick={onClose}><Icon.X/></button>
      </div>

      <div className="tweak-row">
        <label>LAYOUT</label>
        <div className="seg">
          {['grid', 'rows', 'stack'].map(v => (
            <button key={v} className={tweaks.layout === v ? 'on' : ''} onClick={() => patch('layout', v)}>{v.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div className="tweak-row">
        <label>THEME</label>
        <div className="seg">
          {[{k:'light',l:'LIGHT'},{k:'paper',l:'PAPER'},{k:'terminal',l:'TERMINAL'},{k:'blueprint',l:'BLUEPRINT'}].map(v => (
            <button key={v.k} className={tweaks.theme === v.k ? 'on' : ''} onClick={() => patch('theme', v.k)}>{v.l}</button>
          ))}
        </div>
      </div>

      <div className="tweak-row">
        <label>SLOTS</label>
        <div className="seg">
          {[4, 6, 9].map(v => (
            <button key={v} className={tweaks.slotCount === v ? 'on' : ''} onClick={() => patch('slotCount', v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tweak-row">
        <label>TRIM</label>
        <div className="seg">
          {[4, 6, 8, 10].map(v => (
            <button key={v} className={tweaks.trimDigits === v ? 'on' : ''} onClick={() => patch('trimDigits', v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tweak-row toggle">
        <label>BARCODE PREVIEW</label>
        <button className={`sw ${tweaks.showPreview ? 'on' : ''}`} onClick={() => patch('showPreview', !tweaks.showPreview)}>
          <span/>
        </button>
      </div>
      <div className="tweak-row toggle">
        <label>AUTO-COPY ON SCAN</label>
        <button className={`sw ${tweaks.autoCopy ? 'on' : ''}`} onClick={() => patch('autoCopy', !tweaks.autoCopy)}>
          <span/>
        </button>
      </div>
      <div className="tweak-row toggle">
        <label>BEEP ON SCAN</label>
        <button className={`sw ${tweaks.beepOnScan ? 'on' : ''}`} onClick={() => patch('beepOnScan', !tweaks.beepOnScan)}>
          <span/>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/Tweaks.jsx
git commit -m "feat: migrate TweaksPanel to ES module"
```

---

## Task 9: Migrate App.jsx with new save flow

**Files:**
- Create: `src/renderer/src/App.jsx`

This is the most significant change. Key differences from `src/app_main.jsx`:
1. ES module imports replace globals
2. `saveFile()` calls `window.electronAPI.saveFile()` instead of triggering a blob download — uses `buildFilename` and `formatFileContent`
3. The sidebar `onRedownload` re-saves via `electronAPI` instead of re-triggering a blob download
4. Sidebar footer text updated to show `~/Documents/trimcodes/`
5. The Claude edit-mode `useEffect` (lines 42–51 of original) is removed
6. The `ReactDOM.createRoot` mount at the bottom is removed (it moves to `main.jsx`)

- [ ] **Step 1: Create `src/renderer/src/App.jsx`**

```jsx
import { useState, useEffect, useRef } from 'react'
import { TWEAK_DEFAULTS, uid, nowStamp, trimRight, BarcodePreview, Icon, buildFilename, formatFileContent } from './utils'
import ScanModal from './ScanModal'
import TweaksPanel from './Tweaks'

const EMPTY_SLOTS = (n) => Array.from({ length: n }, () => ({ id: uid(), code: null, scannedAt: null }))

export default function App() {
  const [tweaks, setTweaks] = useState({ ...TWEAK_DEFAULTS })
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [company, setCompany] = useState('')
  const [refId, setRefId] = useState('')
  const [slots, setSlots] = useState(EMPTY_SLOTS(TWEAK_DEFAULTS.slotCount))
  const [scanning, setScanning] = useState(null)
  const [copied, setCopied] = useState(null)
  const [savedFiles, setSavedFiles] = useState([])
  const [toast, setToast] = useState(null)
  const fileCounter = useRef(1)

  useEffect(() => { document.body.dataset.theme = tweaks.theme }, [tweaks.theme])

  useEffect(() => {
    setSlots((prev) => {
      const next = EMPTY_SLOTS(tweaks.slotCount)
      for (let i = 0; i < Math.min(prev.length, tweaks.slotCount); i++) next[i] = prev[i]
      return next
    })
  }, [tweaks.slotCount])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('trimcode:session') || 'null')
      if (saved) {
        if (saved.company) setCompany(saved.company)
        if (saved.refId) setRefId(saved.refId)
        if (saved.slots && saved.slots.length) setSlots(saved.slots)
        if (saved.savedFiles) setSavedFiles(saved.savedFiles)
        if (saved.fileCounter) fileCounter.current = saved.fileCounter
      }
    } catch (e) {}
  }, [])

  useEffect(() => {
    const data = { company, refId, slots, savedFiles, fileCounter: fileCounter.current }
    localStorage.setItem('trimcode:session', JSON.stringify(data))
  }, [company, refId, slots, savedFiles])

  const completeScan = (code) => {
    if (scanning === null) return
    const idx = scanning
    setSlots((prev) => prev.map((s, i) => i === idx ? { ...s, code, scannedAt: Date.now() } : s))
    setScanning(null)
    if (tweaks.autoCopy) {
      navigator.clipboard.writeText(trimRight(code, tweaks.trimDigits)).catch(() => {})
      showToast('Auto-copied to clipboard')
    }
  }

  const copySlot = (i) => {
    const s = slots[i]
    if (!s.code) return
    navigator.clipboard.writeText(trimRight(s.code, tweaks.trimDigits)).catch(() => {})
    setCopied({ type: 'slot', key: i })
    setTimeout(() => setCopied(null), 1400)
  }

  const copyAll = () => {
    const lines = slots.filter(s => s.code).map((s, i) => `${String(i + 1).padStart(2, '0')}  ${trimRight(s.code, tweaks.trimDigits)}`)
    if (!lines.length) return
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
    setCopied({ type: 'all', key: 'all' })
    setTimeout(() => setCopied(null), 1400)
  }

  const newFile = () => {
    if (slots.some(s => s.code)) {
      if (!confirm('Start a new file? Current unsaved scans will be cleared.')) return
    }
    setSlots(EMPTY_SLOTS(tweaks.slotCount))
    setCompany('')
    setRefId('')
    showToast('New file started')
  }

  const saveFile = async () => {
    const filled = slots.filter(s => s.code)
    if (!filled.length) { showToast('Nothing to save — scan at least one code'); return }
    if (!company.trim() || !refId.trim()) { showToast('Company and ID are required'); return }

    const filename = buildFilename(company, refId)
    const body = formatFileContent(slots, tweaks.trimDigits)
    const result = await window.electronAPI.saveFile(filename, body)

    if (!result.success) {
      showToast(`Save failed: ${result.error}`)
      return
    }

    const record = {
      id: uid(),
      n: fileCounter.current++,
      filename,
      company,
      refId,
      stamp: nowStamp(),
      count: filled.length,
      body,
    }
    setSavedFiles((prev) => [record, ...prev].slice(0, 40))
    showToast(`Saved → ${filename}`)
  }

  const redownload = async (rec) => {
    const result = await window.electronAPI.saveFile(rec.filename, rec.body)
    if (result.success) showToast(`Re-saved → ${rec.filename}`)
    else showToast(`Re-save failed: ${result.error}`)
  }

  const showToast = (msg) => {
    setToast({ msg, key: uid() })
    setTimeout(() => setToast((t) => t && t.msg === msg ? null : t), 2600)
  }

  const filledCount = slots.filter(s => s.code).length
  const readyToSave = company.trim() && refId.trim() && filledCount > 0

  return (
    <div className={`app layout-${tweaks.layout}`}>
      <Header
        onNewFile={newFile}
        onTweaks={() => setTweaksOpen(v => !v)}
        filledCount={filledCount}
        totalSlots={slots.length}
      />

      <main className="main">
        <section className="scan-area">
          <MetaBar
            company={company} setCompany={setCompany}
            refId={refId} setRefId={setRefId}
            filledCount={filledCount} total={slots.length}
          />

          <SlotGrid
            slots={slots}
            layout={tweaks.layout}
            showPreview={tweaks.showPreview}
            trimDigits={tweaks.trimDigits}
            onTapSlot={(i) => setScanning(i)}
            onCopy={copySlot}
            onClear={(i) => setSlots((prev) => prev.map((s, j) => j === i ? { id: uid(), code: null, scannedAt: null } : s))}
            copied={copied}
          />

          <ActionBar
            onCopyAll={copyAll}
            onSave={saveFile}
            filledCount={filledCount}
            total={slots.length}
            copied={copied}
            readyToSave={readyToSave}
          />
        </section>

        <Sidebar savedFiles={savedFiles} onRedownload={redownload} />
      </main>

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

      <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} open={tweaksOpen} onClose={() => setTweaksOpen(false)} />

      {toast && <div key={toast.key} className="toast">{toast.msg}</div>}
    </div>
  )
}

function Header({ onNewFile, onTweaks, filledCount, totalSlots }) {
  const pct = Math.round((filledCount / totalSlots) * 100)
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark">
          <span className="m-bar"/><span className="m-bar"/><span className="m-bar"/><span className="m-bar"/><span className="m-bar"/><span className="m-bar"/>
        </div>
        <div className="brand-text">
          <div className="brand-title">TRIM CODE</div>
          <div className="brand-sub">INJECTOR ID SCANNER <span className="sep">·</span> v1.4</div>
        </div>
      </div>

      <div className="status">
        <div className="s-item">
          <span className="s-k">SLOTS</span>
          <span className="s-v">{String(filledCount).padStart(2, '0')}/{String(totalSlots).padStart(2, '0')}</span>
        </div>
        <div className="s-item">
          <span className="s-k">FILL</span>
          <span className="s-bar"><i style={{ width: `${pct}%` }}/></span>
        </div>
        <div className="s-item">
          <span className="s-k">CAM</span>
          <span className="s-v live"><span className="pulse"/>READY</span>
        </div>
      </div>

      <div className="head-actions">
        <button className="ghost-btn" onClick={onTweaks}><Icon.Sliders/> TWEAKS</button>
        <button className="primary-btn" onClick={onNewFile}><Icon.Plus/> NEW FILE</button>
      </div>
    </header>
  )
}

function MetaBar({ company, setCompany, refId, setRefId, filledCount, total }) {
  return (
    <div className="metabar">
      <div className="meta-field">
        <label>COMPANY</label>
        <input
          type="text"
          placeholder="e.g. NORTHGATE DIESEL"
          value={company}
          onChange={(e) => setCompany(e.target.value.toUpperCase())}
          spellCheck={false}
        />
      </div>
      <div className="meta-field">
        <label>REF / ID</label>
        <input
          type="text"
          placeholder="e.g. WO-2026-04-081"
          value={refId}
          onChange={(e) => setRefId(e.target.value.toUpperCase())}
          spellCheck={false}
        />
      </div>
      <div className="meta-stat">
        <span className="k">FILE</span>
        <span className="v">{company && refId ? `${company} · ${refId}` : <em className="em">— awaiting input —</em>}</span>
      </div>
    </div>
  )
}

function SlotGrid({ slots, layout, showPreview, trimDigits, onTapSlot, onCopy, onClear, copied }) {
  return (
    <div className={`grid grid-${layout} grid-n-${slots.length}`}>
      {slots.map((slot, i) => (
        <Slot
          key={slot.id}
          index={i}
          slot={slot}
          showPreview={showPreview}
          trimDigits={trimDigits}
          onTap={() => onTapSlot(i)}
          onCopy={() => onCopy(i)}
          onClear={() => onClear(i)}
          copied={copied && copied.type === 'slot' && copied.key === i}
        />
      ))}
    </div>
  )
}

function Slot({ index, slot, showPreview, trimDigits, onTap, onCopy, onClear, copied }) {
  const tag = String(index + 1).padStart(2, '0')
  const trimmed = slot.code ? trimRight(slot.code, trimDigits) : null
  const filled = !!slot.code

  return (
    <div className={`slot ${filled ? 'is-filled' : 'is-empty'}`}>
      <div className="slot-tag">
        <span className="t-num">{tag}</span>
        {filled ? <span className="t-state ok">● SCANNED</span> : <span className="t-state">○ EMPTY</span>}
        {filled && <button className="slot-clear" onClick={onClear} title="Clear slot"><Icon.X size={11}/></button>}
      </div>

      <button className="slot-body" onClick={onTap}>
        {filled ? (
          <>
            <div className="slot-code">{trimmed}</div>
            <div className="slot-full">{slot.code}</div>
            {showPreview && (
              <div className="slot-preview">
                <BarcodePreview value={slot.code} width={220} height={36}/>
              </div>
            )}
          </>
        ) : (
          <div className="slot-empty-inner">
            <div className="slot-icon"><Icon.Scan size={44}/></div>
            <div className="slot-cta">TAP TO SCAN</div>
            <div className="slot-hint">camera → injector code</div>
          </div>
        )}
      </button>

      <button className={`slot-copy ${!filled ? 'disabled' : ''} ${copied ? 'copied' : ''}`} disabled={!filled} onClick={onCopy}>
        {copied
          ? (<><Icon.Check/> COPIED</>)
          : (<><Icon.Copy/> COPY {filled ? `· ${trimmed}` : ''}</>)
        }
      </button>
    </div>
  )
}

function ActionBar({ onCopyAll, onSave, filledCount, total, copied, readyToSave }) {
  const copiedAll = copied && copied.type === 'all'
  return (
    <div className="actionbar">
      <button className="ghost-btn big" onClick={onCopyAll} disabled={filledCount === 0}>
        {copiedAll ? (<><Icon.Check/> ALL COPIED</>) : (<><Icon.Copy/> COPY ALL ({filledCount})</>)}
      </button>

      <div className="ab-spacer">
        {!readyToSave && filledCount === 0 && <span className="hint">scan at least one code to save</span>}
        {!readyToSave && filledCount > 0 && <span className="hint warn">enter company + ref / id to enable save</span>}
        {readyToSave && <span className="hint ok">ready — saves to ~/Documents/trimcodes/</span>}
      </div>

      <button className={`save-btn ${readyToSave ? 'is-ready' : ''}`} onClick={onSave} disabled={!readyToSave}>
        <span className="sv-inner">
          <Icon.Download size={16}/> SAVE FILE
        </span>
        <span className="sv-meta">{filledCount}/{total} · .txt</span>
      </button>
    </div>
  )
}

function Sidebar({ savedFiles, onRedownload }) {
  return (
    <aside className="sidebar">
      <div className="side-head">
        <span><Icon.Folder/> SAVED FILES</span>
        <span className="side-count">{savedFiles.length}</span>
      </div>
      {savedFiles.length === 0 && (
        <div className="side-empty">
          <div className="se-icon"><Icon.Folder size={26}/></div>
          <div className="se-title">NO FILES YET</div>
          <div className="se-hint">Saved .txt files will appear here<br/>and in ~/Documents/trimcodes/</div>
        </div>
      )}
      <div className="side-list">
        {savedFiles.map((rec) => (
          <div key={rec.id} className="side-item" onClick={() => onRedownload(rec)}>
            <div className="si-num">#{String(rec.n).padStart(3, '0')}</div>
            <div className="si-main">
              <div className="si-title">{rec.company} <span className="sep">·</span> {rec.refId}</div>
              <div className="si-meta">{rec.count} codes <span className="sep">·</span> {rec.stamp}</div>
              <div className="si-file">{rec.filename}</div>
            </div>
            <div className="si-dl"><Icon.Download size={14}/></div>
          </div>
        ))}
      </div>
      <div className="side-foot">
        <div className="sf-row"><span className="k">DIR</span><span className="v">~/Documents/trimcodes/</span></div>
        <div className="sf-row"><span className="k">FMT</span><span className="v">.txt · plain</span></div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/App.jsx
git commit -m "feat: migrate App to ES module with Electron save flow"
```

---

## Task 10: Create renderer entry point and copy styles

**Files:**
- Create: `src/renderer/src/main.jsx`
- Create: `src/renderer/src/styles.css`

- [ ] **Step 1: Create `src/renderer/src/main.jsx`**

```jsx
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './styles.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
```

- [ ] **Step 2: Copy styles**

```bash
cp src/styles.css src/renderer/src/styles.css
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/main.jsx src/renderer/src/styles.css
git commit -m "feat: add renderer entry point and styles"
```

---

## Task 11: Create preload script

**Files:**
- Create: `src/preload/index.js`

- [ ] **Step 1: Create `src/preload/index.js`**

```js
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (filename, content) => ipcRenderer.invoke('save-file', { filename, content }),
})
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/index.js
git commit -m "feat: add preload contextBridge for saveFile IPC"
```

---

## Task 12: Create Electron main process

**Files:**
- Create: `src/main/index.js`

- [ ] **Step 1: Create `src/main/index.js`**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main/index.js
git commit -m "feat: add Electron main process with save-file IPC handler"
```

---

## Task 13: Create README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# Trim Code

Injector barcode scanner desktop utility built with Electron + Vite + React.

## Prerequisites

- Node.js 18 or newer
- npm

## Install

```bash
npm install
```

## Development

Start the app with hot-reload:

```bash
npm run dev
```

This opens the Electron window. Changes to JSX or CSS reload automatically.

## Production Build

```bash
npm run build
```

Bundles everything into `out/`. Then launch the built app:

```bash
npm run preview
```

## Tests

```bash
npm test
```

## Saved Files

Files are saved to `~/Documents/trimcodes/` as plain text.

Filename format: `{COMPANY}{REFID}.txt`  
Example: company `ABC`, ref `123` → `ABC123.txt`

File format:
```
[04-20-2026 12:33 PM]
1 CODE-ONE
2 CODE-TWO
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with dev, build, and run instructions"
```

---

## Task 14: Run the app and verify

- [ ] **Step 1: Run `npm run dev`**

```bash
npm run dev
```

Expected: Electron window opens at 1400px wide showing the Trim Code UI with all four themes available in Tweaks.

- [ ] **Step 2: Verify the save flow**

In the running app:
1. Enter a company name (e.g. `ABC`) and a ref ID (e.g. `123`)
2. Click a slot → scan modal opens → click ACCEPT
3. Click SAVE FILE
4. Expected: toast shows `Saved → ABC123.txt`
5. Check `~/Documents/trimcodes/ABC123.txt` exists with the correct format

```bash
cat ~/Documents/trimcodes/ABC123.txt
```

Expected output:
```
[MM-DD-YYYY HH:MM AM/PM]
1 <trimmed-code>
```

- [ ] **Step 3: Move old flat source files to scraps**

The old flat files live alongside the new `src/main/`, `src/preload/`, `src/renderer/` subdirectories — move only the flat files, do not remove `src/`.

```bash
mv "Trim Code.html" scraps/
mv src/app_main.jsx scraps/
mv src/scan_modal.jsx scraps/
mv src/tweaks.jsx scraps/
mv src/utils.jsx scraps/
mv src/entry.jsx scraps/
mv src/styles.css scraps/
# move the napkin sketch file if present
mv src/*.napkin scraps/ 2>/dev/null || true
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: move old CDN source files to scraps"
```
