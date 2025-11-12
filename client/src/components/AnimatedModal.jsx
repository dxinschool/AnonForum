import React, { useEffect, useState, useRef } from 'react'

export default function AnimatedModal({ visible, onClose, width, height, children }) {
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(visible)
  const modalRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (visible) {
      // mount and ensure not in closing state so enter animation plays
      setMounted(true)
      setClosing(false)
    } else if (mounted) {
      // if parent requested close (visible became false), play closing animation
      setClosing(true)
      // after animation ends, actually unmount
      const t = setTimeout(() => {
        setClosing(false)
        setMounted(false)
      }, 260)
      return () => clearTimeout(t)
    }
  }, [visible])

  // focus trapping and ESC-to-close
  useEffect(() => {
    if (!mounted) return
    const node = modalRef.current
    if (!node) return
    // save previously focused element
    previouslyFocused.current = document.activeElement

    const focusableSelector = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]'
    const getFocusables = () => {
      try {
        return Array.from(node.querySelectorAll(focusableSelector)).filter(el => el.offsetWidth || el.offsetHeight || el.getClientRects().length)
      } catch (e) { return [] }
    }

    // focus first focusable or the modal itself
    const focusables = getFocusables()
    if (focusables.length) focusables[0].focus()
    else try { node.focus() } catch (e) {}

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        try { onClose && onClose() } catch (err) {}
        return
      }
      if (e.key === 'Tab') {
        const f = getFocusables()
        if (f.length === 0) {
          e.preventDefault()
          return
        }
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      // restore focus
      try { previouslyFocused.current && previouslyFocused.current.focus() } catch (e) {}
    }
  }, [mounted, onClose])

  if (!mounted) return null
  // default to filling the available viewport space (minus overlay padding)
  // but allow caller to override with explicit width/height
  const style = {}
  if (width) style.width = width
  else style.width = 'calc(100vw - 48px)'
  if (height) style.height = height
  else style.height = 'calc(100vh - 48px)'
  // keep a sensible max so CSS constraints still apply
  style.maxWidth = '96%'
  style.maxHeight = '92%'

  return (
    <div className={`animated-overlay ${closing ? 'closing' : (visible ? 'open' : '')}`} onClick={() => { try { onClose && onClose() } catch (e) {} }} role="dialog" aria-modal="true">
      <div ref={modalRef} className={`animated-card ${closing ? 'closing' : (visible ? 'open' : '')}`} onClick={e => e.stopPropagation()} style={style} tabIndex={-1}>
        <button aria-label="Close" onClick={() => { try { onClose && onClose() } catch (e) {} }} style={{ position: 'absolute', right: 8, top: 8, border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' }}>✕</button>
        <div style={{ paddingTop: 6 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
