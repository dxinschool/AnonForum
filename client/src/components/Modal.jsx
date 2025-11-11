import React from 'react'

export default function Modal({ isOpen, title, children, onCancel, onConfirm, confirmText = 'OK', cancelText = 'Cancel' }) {
  if (!isOpen) return null
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        {title && <h3 style={{ margin: 0, marginBottom: 8 }}>{title}</h3>}
        <div style={{ marginBottom: 12 }}>{children}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn secondary" onClick={onCancel}>{cancelText}</button>
          <button className="btn" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}
