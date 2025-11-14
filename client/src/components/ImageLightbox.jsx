import React from 'react'

export default function ImageLightbox({ src, alt, isOpen, onClose }) {
  if (!isOpen) return null
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn secondary" onClick={onClose}>X</button>
        </div>
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <img src={src} alt={alt || 'image'} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8 }} />
        </div>
      </div>
    </div>
  )
}
