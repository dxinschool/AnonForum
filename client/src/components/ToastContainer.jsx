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
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type === 'error' ? 'toast-error' : ''}`}>{t.text}</div>
      ))}
    </div>
  )
}
