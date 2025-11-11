import React, { useState } from 'react'
import API from '../api'

export default function NewThread({ onCreate }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState(null)
  const [tags, setTags] = useState('')

  const TITLE_MAX = 200
  const BODY_MAX = 2000

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    if (title.length > TITLE_MAX) return alert(`Title too long (max ${TITLE_MAX})`)
    if (body.length > BODY_MAX) return alert(`Body too long (max ${BODY_MAX})`)
    setLoading(true)
    try {
      let t
      if (file) {
        t = await API.createThreadWithFile(title, body, file, tags)
      } else {
        t = await API.createThread(title, body, tags)
      }
      setTitle('')
      setBody('')
      setFile(null)
      setTags('')
      if (onCreate) onCreate(t)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ marginBottom: 16 }}>
      <h2>New Thread</h2>
  <input className="input" placeholder="Title" value={title} maxLength={TITLE_MAX} onChange={e => setTitle(e.target.value)} />
  <textarea className="input" rows={4} placeholder="Body (optional)" value={body} maxLength={BODY_MAX} onChange={e => setBody(e.target.value)} />
  <div style={{ marginTop: 8 }}>
    <input type="file" accept="image/*" onChange={e => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
    {file && <div style={{ marginTop: 6 }}><small>Selected: {file.name} ({Math.round(file.size/1024)} KB)</small></div>}
  </div>
  <div style={{ marginTop: 8 }}>
    <input className="input" placeholder="Tags (comma separated, optional)" value={tags} onChange={e => setTags(e.target.value)} />
  </div>
      <button className="btn" type="submit" disabled={loading}>{loading ? 'Posting...' : 'Post'}</button>
    </form>
  )
}
