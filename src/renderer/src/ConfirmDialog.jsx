import { useEffect, useRef } from 'react'

// Shared in-app confirmation modal. Replaces window.confirm and the one-off
// modal components. Esc cancels, Enter triggers the default action, focus is
// trapped while open and returns to the triggering element on close, and
// clicking the backdrop cancels.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'CONFIRM',
  cancelLabel = 'CANCEL',
  tertiaryLabel,
  destructive = false,
  defaultAction = 'confirm',
  onConfirm,
  onCancel,
  onTertiary,
}) {
  const modalRef = useRef(null)
  const confirmRef = useRef(null)
  const cancelRef = useRef(null)
  const tertiaryRef = useRef(null)

  const hasTertiary = !!tertiaryLabel && !!onTertiary
  const resolvedDefault =
    defaultAction === 'tertiary' && !hasTertiary ? 'confirm' : defaultAction

  const runDefault = () => {
    if (resolvedDefault === 'cancel') onCancel()
    else if (resolvedDefault === 'tertiary') onTertiary()
    else onConfirm()
  }

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const defaultBtn =
      resolvedDefault === 'cancel'
        ? cancelRef.current
        : resolvedDefault === 'tertiary'
          ? tertiaryRef.current
          : confirmRef.current
    defaultBtn?.focus()
    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key === 'Enter' && e.target === modalRef.current) {
      e.preventDefault()
      runDefault()
      return
    }
    if (e.key === 'Tab') {
      const buttons = Array.from(
        modalRef.current.querySelectorAll('button:not([disabled])')
      )
      if (buttons.length === 0) return
      const idx = buttons.indexOf(document.activeElement)
      const delta = e.shiftKey ? -1 : 1
      const nextIdx = (idx + delta + buttons.length) % buttons.length
      e.preventDefault()
      buttons[nextIdx].focus()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal modal-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
        ref={modalRef}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-label" id="confirm-dialog-title">
            <span className="dot dot-warn" />
            {title}
          </span>
        </div>
        <div className="modal-body">
          {typeof message === 'string' ? <div className="ow-msg">{message}</div> : message}
        </div>
        <div className="modal-foot">
          {hasTertiary && (
            <button className="ghost-btn modal-tertiary" ref={tertiaryRef} onClick={onTertiary}>
              {tertiaryLabel}
            </button>
          )}
          <button className="ghost-btn" ref={cancelRef} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`primary-btn ${destructive ? 'danger' : ''}`}
            ref={confirmRef}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
