import React, { useEffect, useState, useRef } from 'react'
import { subscribe, send } from '../ws'
import { timeAgo } from '../time'

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === 'history') setMessages(msg.data || [])
      else if (msg.type === 'message') setMessages(prev => [...prev, msg.data])
    })
    return () => unsub()
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

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Global Chat</h3>
      <div style={{ border: '1px solid #ddd', padding: 8, height: 220, overflow: 'auto', borderRadius: 6, background: '#fafafa' }}>
        {messages.map(m => (
          <div key={m.id} style={{ padding: '6px 4px', borderBottom: '1px solid #eee' }}>
            <div style={{ fontSize: 12, color: '#555' }}><strong>{m.author}</strong> <small style={{ marginLeft: 8 }}>{timeAgo(m.created_at)}</small></div>
            <div style={{ marginTop: 4 }}>{m.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMsg} style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Say something..." />
        <button className="btn" type="submit">Send</button>
      </form>
    </div>
  )
}
