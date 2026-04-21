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
      lines.push(`${n} ${slot.code}`)
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
