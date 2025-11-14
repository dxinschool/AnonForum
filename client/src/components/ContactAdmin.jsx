import React, { useState } from 'react'
import toast from '../toast'

export default function ContactAdmin({ onClose }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!message || message.trim().length === 0) return toast.show('Please enter a message', { type: 'error' })
    setLoading(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || null, email: email || null, message: message })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.show(err && err.error ? (err.error || 'Failed') : 'Failed to send message', { type: 'error' })
      } else {
        toast.show('Message sent — thanks!', { type: 'default' })
        setName('')
        setEmail('')
        setMessage('')
        try { onClose && onClose() } catch (e) {}
      }
    } catch (err) {
      console.warn('contact submit failed', err)
      toast.show('Failed to send message', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <h3>Contact Admin</h3>
      <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 13 }}>Leave a short message for the site admin. We'll store it and the admin can review it.</p>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 13 }}>Name (optional)</label>
          <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 13 }}>Email (optional)</label>
          <input value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 13 }}>Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn secondary" onClick={() => { try { onClose && onClose() } catch (e) {} }} disabled={loading}>Cancel</button>
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send'}</button>
        </div>
      </form>
    </div>
  )
}
