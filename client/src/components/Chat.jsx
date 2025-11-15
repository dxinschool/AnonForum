import React, { useEffect, useState, useRef } from 'react'
import { subscribe, send } from '../ws'
import API from '../api'
import admin from '../admin'
import { timeAgo } from '../time'
import toast from '../toast'
import ImageLightbox from './ImageLightbox'


export default function Chat() {
  const [messages, setMessages] = useState([])
  const [pinned, setPinned] = useState(null)
  const [text, setText] = useState('')
  const bottomRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const fileInputRef = useRef(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerSrc, setViewerSrc] = useState(null)

  useEffect(() => {
    // track admin login state so admin UI (pin/unpin) is shown
    const unsubAdmin = admin.subscribe(t => {
      // no-op, subscription ensures localStorage is kept updated; component will read admin.getToken() when needed
    })
    // load current history from REST (ensures history is shown on every mount)
    let mounted = true
    fetch('/api/chat').then(r => r.ok ? r.json() : Promise.reject('fetch failed')).then(data => {
      if (mounted) setMessages(data || [])
    }).catch(err => { /* ignore fetch errors */ })

    const unsub = subscribe((msg) => {
      if (msg.type === 'history') {
        setMessages(msg.data || [])
        // detect pinned message in history
        const p = (msg.data || []).find(m => m.pinned)
        if (p) setPinned(p)
      } else if (msg.type === 'message') setMessages(prev => [...prev, msg.data])
      else if (msg.type === 'error') {
        // server-side error for this connection (e.g. blocked content)
        try { if (msg.error === 'blocked') toast.show('Message blocked by server') } catch (e) {}
      }
      else if (msg.type === 'chat_pin') {
        const { id, pinned } = msg.data || {}
        // update messages and compute pinned message from the updated list to avoid stale closure
        setMessages(prev => {
          const next = (prev || []).map(m => m.id === id ? { ...m, pinned } : m)
          if (pinned) {
            const pm = next.find(m => m.id === id) || null
            setPinned(pm)
          } else {
            setPinned(null)
          }
          return next
        })
      }
    })
    return () => { mounted = false; unsub(); unsubAdmin() }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // using shared timeAgo helper

  const CHAT_MAX = 500

  const sendMsg = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    if (text.length > CHAT_MAX) return alert(`Message too long (max ${CHAT_MAX})`)
    const payload = { type: 'message', payload: { text } }
    send(payload)
    setText('')
  }

  const sendWithImage = async (e) => {
    e.preventDefault()
    if (!file) return sendMsg(e)
    // upload file first
    const fd = new FormData()
    fd.append('image', file)
    try {
      const res = await fetch('/api/chat/upload', { method: 'POST', body: fd })
      // handle 413 (nginx) with a user-friendly message instead of raw HTML
      if (res.status === 413) {
        toast.show('Uploaded file exceeds maximum allowed size', { type: 'error' })
        return
      }
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        if (j && j.error === 'blocked') { toast.show('Message blocked by server'); return }
        throw new Error('upload failed')
      }
      const body = j || {}
      const payload = { type: 'message', payload: { text, image: body.url } }
      send(payload)
      setText('')
      setFile(null)
      setPreview(null)
      toast.show('Message sent')
    } catch (err) {
      console.warn('chat upload failed', err)
      toast.show('Upload failed')
    }
  }

  return (
    <>
    <div style={{ marginTop: 20 }}>
      <h3>Global Chat</h3>
  <div className="chat-container">
        {/** show pinned message(s) at the top */}
        {(messages.filter(m => m.pinned) || []).map(m => (
          <div key={m.id} className={`chat-message pinned`}>
            <div className="chat-meta"><strong>{m.author}</strong> <small style={{ marginLeft: 8 }}>{timeAgo(m.created_at)}</small> <span className="pinned-label">Pinned</span></div>
            <div className="chat-text">{m.text}</div>
            {m.image && <div className="chat-thumb"><img src={m.image} className="thumb" alt="chat" style={{ cursor: 'pointer' }} onClick={() => { setViewerSrc(m.image); setViewerOpen(true) }} /></div>}
            {admin.getToken() && <div style={{ marginTop: 6 }}><button className="btn small ghost" onClick={async () => {
              try {
                await API.adminPinChat(m.id, false)
                setMessages(prev => (prev || []).map(x => x.id === m.id ? { ...x, pinned: false } : x))
                toast.show('Unpinned')
              } catch (e) { console.warn('unpin failed', e); toast.show('Unpin failed') }
            }}>Unpin</button></div>}
          </div>
        ))}

        {messages.filter(m => !m.pinned).map(m => (
          <div key={m.id} className="chat-message">
            <div className="chat-meta"><strong>{m.author}</strong> <small style={{ marginLeft: 8 }}>{timeAgo(m.created_at)}</small></div>
            <div className="chat-text">{m.text}</div>
            {m.image && <div className="chat-thumb"><img src={m.image} className="thumb" alt="chat" style={{ cursor: 'pointer' }} onClick={() => { setViewerSrc(m.image); setViewerOpen(true) }} /></div>}
            {admin.getToken() && <div style={{ marginTop: 6 }}><button className="btn small ghost" onClick={async () => {
              try {
                await API.adminPinChat(m.id, true)
                setMessages(prev => (prev || []).map(x => x.id === m.id ? { ...x, pinned: true } : x))
                toast.show('Pinned')
              } catch (e) { console.warn('pin failed', e); toast.show('Pin failed') }
            }}>Pin</button></div>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendWithImage} className="chat-form">
        <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Say something..." />
        <label className="file-upload">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={e => {
            const f = e.target.files && e.target.files[0]
            if (!f) { setFile(null); setPreview(null); return }
            setFile(f)
            const url = URL.createObjectURL(f)
            setPreview(url)
          }} />
          <button type="button" className="btn small ghost" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Attach</button>
        </label>
        <button className="btn" type="submit">Send</button>
      </form>
      {preview && (
        <div className="chat-preview">
          <img src={preview} alt="preview" className="thumb" />
          <div>
            <div style={{ fontSize: 13 }}>{file && file.name}</div>
            <div style={{ marginTop: 6 }}>
              <button className="btn small" onClick={() => { setFile(null); setPreview(null) }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
    <ImageLightbox isOpen={viewerOpen} src={viewerSrc} onClose={() => setViewerOpen(false)} />
    </>
  )
}
