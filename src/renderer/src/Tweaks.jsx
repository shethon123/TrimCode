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
          {[4, 6, 8].map(v => (
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
      <div className="tweak-row toggle">
        <label>AUTO ADVANCE</label>
        <button className={`sw ${tweaks.autoAdvance ? 'on' : ''}`} onClick={() => patch('autoAdvance', !tweaks.autoAdvance)}>
          <span/>
        </button>
      </div>
    </div>
  )
}
