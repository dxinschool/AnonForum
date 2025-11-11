import React, { useEffect, useState } from 'react'
import toast from '../toast'

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])
  useEffect(() => {
    const unsub = toast.subscribe((msg) => {
      if (msg.type === 'add') setToasts(t => [msg.toast, ...t])
      if (msg.type === 'remove') setToasts(t => t.filter(x => x.id !== msg.id))
    })
    return unsub
  }, [])

  if (!toasts || toasts.length === 0) return null
  return (
    <div style={{ position: 'fixed', right: 12, top: 12, zIndex: 9999 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: '#333', color: '#fff', padding: '8px 12px', borderRadius: 6, marginBottom: 8, boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>{t.text}</div>
      ))}
    </div>
  )
}
