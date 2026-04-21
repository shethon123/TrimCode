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
