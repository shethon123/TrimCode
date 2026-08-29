import { useState, useEffect, useRef } from 'react'
import { TWEAK_DEFAULTS, FONT_STACKS, uid, nowStamp, trimRight, beep, BarcodePreview, Icon, buildFilename, formatFileContent } from './utils'
import TweaksPanel from './Tweaks'

const FLASH_MS = 250

const EMPTY_SLOTS = (n) => Array.from({ length: n }, () => ({ id: uid(), code: null, scannedAt: null }))

export default function App() {
  const [tweaks, setTweaks] = useState({ ...TWEAK_DEFAULTS })
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [company, setCompany] = useState('')
  const [refId, setRefId] = useState('')
  const [slots, setSlots] = useState(EMPTY_SLOTS(TWEAK_DEFAULTS.slotCount))
  const [scanning, setScanning] = useState(null)
  const [decodeBuffer, setDecodeBuffer] = useState('')
  const [flickerChars, setFlickerChars] = useState('')
  const [flashSlot, setFlashSlot] = useState(null)
  const [copied, setCopied] = useState(null)
  const [savedFiles, setSavedFiles] = useState([])
  const [toast, setToast] = useState(null)
  const [overwritePending, setOverwritePending] = useState(null)
  const [newFilePending, setNewFilePending] = useState(false)
  const fileCounter = useRef(1)

  useEffect(() => { document.body.dataset.theme = tweaks.theme }, [tweaks.theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-ui', FONT_STACKS.ui[tweaks.uiFont])
    document.documentElement.style.setProperty('--font-mono', FONT_STACKS.code[tweaks.codeFont])
  }, [tweaks.uiFont, tweaks.codeFont])

  useEffect(() => {
    if (scanning === null) { setFlickerChars(''); return }
    const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789-'
    const id = setInterval(() => {
      let s = ''
      for (let i = 0; i < 14; i++) s += pool[Math.floor(Math.random() * pool.length)]
      setFlickerChars(s)
    }, 90)
    return () => clearInterval(id)
  }, [scanning])

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

  const activateScan = (index) => {
    if (slots[index].code) return
    setSlots((prev) => prev.map((s, i) => i === index ? { id: uid(), code: null, scannedAt: null } : s))
    setScanning(index)
    setDecodeBuffer('')
  }

  const cancelScan = () => setScanning(null)

  const commitScan = (index, code) => {
    const updated = slots.map((s, i) => i === index ? { ...s, code, scannedAt: Date.now() } : s)
    setSlots(updated)
    setScanning(null)
    setDecodeBuffer('')
    if (tweaks.beepOnScan) beep(1200, 0.09)

    setFlashSlot(index)
    setTimeout(() => setFlashSlot((f) => (f === index ? null : f)), FLASH_MS)

    if (tweaks.autoCopy) {
      navigator.clipboard.writeText(trimRight(code, tweaks.trimDigits)).catch(() => {})
      showToast('Auto-copied to clipboard')
    }

    if (tweaks.autoAdvance) {
      let next = updated.findIndex((s, i) => i > index && !s.code)
      if (next === -1) next = updated.findIndex(s => !s.code)
      if (next !== -1) setTimeout(() => activateScan(next), FLASH_MS)
    }
  }

  const copySlot = (i) => {
    const s = slots[i]
    if (!s.code) return
    navigator.clipboard.writeText(s.code).catch(() => {})
    setCopied({ type: 'slot', key: i })
    setTimeout(() => setCopied(null), 1200)
  }

  const copyAll = () => {
    const lines = slots.filter(s => s.code).map((s, i) => `${String(i + 1).padStart(2, '0')}  ${trimRight(s.code, tweaks.trimDigits)}`)
    if (!lines.length) return
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
    setCopied({ type: 'all', key: 'all' })
    setTimeout(() => setCopied(null), 1200)
  }

  const newFile = () => {
    if (slots.some(s => s.code)) {
      setNewFilePending(true)
      return
    }
    confirmNewFile()
  }

  const confirmNewFile = () => {
    setNewFilePending(false)
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

    const exists = await window.electronAPI.fileExists(filename)
    if (exists) {
      setOverwritePending({ filename, body })
      return
    }

    await persistSave(filename, body)
  }

  const confirmOverwrite = async () => {
    const { filename, body } = overwritePending
    setOverwritePending(null)
    await persistSave(filename, body)
  }

  const deleteFile = (rec) => {
    setSavedFiles((prev) => prev.filter(f => f.id !== rec.id))
  }

  const openFile = (rec) => {
    if (slots.some(s => s.code)) {
      if (!confirm('Load this file? Current unsaved scans will be replaced.')) return
    }
    setCompany(rec.company)
    setRefId(rec.refId)
    if (rec.slots) {
      setSlots(rec.slots)
    } else {
      const lines = rec.body.split('\n').slice(1)
      const count = Math.max(tweaks.slotCount, lines.length)
      const next = EMPTY_SLOTS(count)
      lines.forEach(line => {
        const match = line.match(/^(\d+)\s+(.+)$/)
        if (match) {
          const idx = parseInt(match[1], 10) - 1
          if (idx >= 0 && idx < next.length) next[idx] = { ...next[idx], code: match[2].trim(), scannedAt: Date.now() }
        }
      })
      setSlots(next)
    }
    showToast(`Opened ${rec.filename}`)
  }

  const showToast = (msg) => {
    setToast({ msg, key: uid() })
    setTimeout(() => setToast((t) => t && t.msg === msg ? null : t), 2600)
  }

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

  const filledCount = slots.filter(s => s.code).length
  const readyToSave = company.trim() && refId.trim() && filledCount > 0

  useEffect(() => {
    const onKeyDown = (e) => {
      if (scanning !== null) {
        if (e.key === 'Escape') { e.preventDefault(); cancelScan(); return }
        if (e.key === 'Enter') {
          e.preventDefault()
          const code = decodeBuffer.trim()
          if (code) commitScan(scanning, code)
          return
        }
        if (e.key === 'Backspace') { setDecodeBuffer((b) => b.slice(0, -1)); return }
        if (e.key.length === 1) { setDecodeBuffer((b) => b + e.key) }
        return
      }

      if (overwritePending || newFilePending) return
      const tag = document.activeElement && document.activeElement.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveFile()
        return
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copyAll()
        return
      }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1
        if (idx < slots.length && !slots[idx].code) activateScan(idx)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [scanning, decodeBuffer, overwritePending, newFilePending, slots, company, refId, tweaks, savedFiles])

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
          <div className="scan-scroll">
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
              scanning={scanning}
              decodeReadout={decodeBuffer || flickerChars}
              flashSlot={flashSlot}
              onActivate={activateScan}
              onCancelScan={cancelScan}
              onCopy={copySlot}
              onClear={(i) => setSlots((prev) => prev.map((s, j) => j === i ? { id: uid(), code: null, scannedAt: null } : s))}
              copied={copied}
            />
          </div>

          <ActionBar
            onCopyAll={copyAll}
            onSave={saveFile}
            filledCount={filledCount}
            total={slots.length}
            copied={copied}
            readyToSave={readyToSave}
          />
        </section>

        <Sidebar savedFiles={savedFiles} onOpen={openFile} onDelete={deleteFile} />
      </main>

      {overwritePending && (
        <OverwriteModal
          filename={overwritePending.filename}
          onConfirm={confirmOverwrite}
          onCancel={() => setOverwritePending(null)}
        />
      )}

      {newFilePending && (
        <NewFileModal
          onConfirm={confirmNewFile}
          onCancel={() => setNewFilePending(false)}
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
          <div className="brand-sub">INJECTOR ID SCANNER</div>
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

function SlotGrid({ slots, layout, showPreview, trimDigits, scanning, decodeReadout, flashSlot, onActivate, onCancelScan, onCopy, onClear, copied }) {
  return (
    <div className={`grid grid-${layout} grid-n-${slots.length}`}>
      {slots.map((slot, i) => (
        <Slot
          key={slot.id}
          index={i}
          slot={slot}
          showPreview={showPreview}
          trimDigits={trimDigits}
          active={scanning === i}
          decodeReadout={decodeReadout}
          justFlashed={flashSlot === i}
          onActivate={() => onActivate(i)}
          onCancelScan={onCancelScan}
          onCopy={() => onCopy(i)}
          onClear={() => onClear(i)}
          copied={copied && copied.type === 'slot' && copied.key === i}
        />
      ))}
    </div>
  )
}

function Slot({ index, slot, showPreview, trimDigits, active, decodeReadout, justFlashed, onActivate, onCancelScan, onCopy, onClear, copied }) {
  const tag = String(index + 1).padStart(2, '0')
  const trimmed = slot.code ? trimRight(slot.code, trimDigits) : null
  const filled = !!slot.code
  const [confirmClear, setConfirmClear] = useState(false)
  const confirmTimeout = useRef(null)

  useEffect(() => () => clearTimeout(confirmTimeout.current), [])

  const handleClearClick = () => {
    setConfirmClear(true)
    confirmTimeout.current = setTimeout(() => setConfirmClear(false), 2500)
  }

  const handleRemoveConfirm = () => {
    clearTimeout(confirmTimeout.current)
    setConfirmClear(false)
    onClear()
  }

  const handleChipBlur = () => {
    clearTimeout(confirmTimeout.current)
    setConfirmClear(false)
  }

  return (
    <div className={`slot ${filled ? 'is-filled' : 'is-empty'} ${active ? 'is-scanning' : ''}`}>
      <div className="slot-tag">
        <span className="t-num">{tag}</span>
        {active ? (
          <span className="t-state scanning"><span className="pulse"/> SCANNING</span>
        ) : filled ? (
          <span className="t-state ok">● SCANNED</span>
        ) : (
          <span className="t-state">○ EMPTY</span>
        )}
        {!active && !filled && index < 9 && <span className="slot-key-hint">{index + 1}</span>}
        {filled && !active && (
          confirmClear ? (
            <button className="slot-remove-chip" onClick={handleRemoveConfirm} onBlur={handleChipBlur} autoFocus>
              REMOVE?
            </button>
          ) : (
            <button className="slot-clear" onClick={handleClearClick} title="Clear slot">
              <Icon.X size={14}/>
            </button>
          )
        )}
      </div>

      <button
        className={`slot-body ${active ? 'scanning' : ''} ${justFlashed ? 'just-scanned' : ''}`}
        onClick={active ? onCancelScan : (filled ? undefined : onActivate)}
      >
        {active ? (
          <div className="scan-zone">
            <span className="scan-corner tl"/><span className="scan-corner tr"/>
            <span className="scan-corner bl"/><span className="scan-corner br"/>
            <span className="scan-line"/>
            <div className="scan-readout">{decodeReadout}</div>
          </div>
        ) : filled ? (
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
          : (<><Icon.Copy/> COPY</>)
        }
      </button>
    </div>
  )
}

function ActionBar({ onCopyAll, onSave, filledCount, total, copied, readyToSave }) {
  const copiedAll = copied && copied.type === 'all'
  return (
    <div className="actionbar">
      <button className={`ghost-btn big ${copiedAll ? 'copied' : ''}`} onClick={onCopyAll} disabled={filledCount === 0}>
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

function Sidebar({ savedFiles, onOpen, onDelete }) {
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
          <div key={rec.id} className="side-item" onClick={() => onOpen(rec)}>
            <div className="si-main">
              <div className="si-title">{rec.company} <span className="sep">·</span> {rec.refId}</div>
              <div className="si-meta">{rec.count} codes</div>
              <div className="si-file">{rec.filename}</div>
            </div>
            <div className="si-del" onClick={(e) => { e.stopPropagation(); onDelete(rec) }}><Icon.X size={12}/></div>
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

function NewFileModal({ onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-label">
            <span className="dot dot-warn" />
            START NEW FILE
          </span>
        </div>
        <div className="modal-body">
          <div className="ow-msg">All data will be cleared.</div>
        </div>
        <div className="modal-foot">
          <button className="ghost-btn" onClick={onCancel}>CANCEL</button>
          <button className="primary-btn" onClick={onConfirm}>NEW FILE</button>
        </div>
      </div>
    </div>
  )
}
