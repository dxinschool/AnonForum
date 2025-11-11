import React, { useState, useEffect } from 'react'
import API from '../api'
import toast from '../toast'

export default function NewThread({ onCreate }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
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

  // create/revoke preview URL when file changes
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => { URL.revokeObjectURL(url) }
  }, [file])

  return (
    <form onSubmit={submit} style={{ marginBottom: 16 }}>
      <h2>New Thread</h2>
  <input className="input" placeholder="Title" value={title} maxLength={TITLE_MAX} onChange={e => setTitle(e.target.value)} />
  <textarea className="input" rows={4} placeholder="Body (optional)" value={body} maxLength={BODY_MAX} onChange={e => setBody(e.target.value)} />
  <div className="file-upload" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
    <input id="thread-file-input" type="file" accept="image/*" onChange={e => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
    <label htmlFor="thread-file-input" className="btn ghost small" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M21 15V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 13l3-3 4 4 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Attach image
    </label>
    {preview && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        <img src={preview} alt="preview" className="thumb" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="file-name" style={{ fontSize: 13, color: '#374151' }}>{file ? file.name : ''} <small style={{ color: '#6b7280' }}>({file ? Math.round(file.size/1024) : ''} KB)</small></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn secondary small" onClick={() => { setFile(null); setPreview(null) }}>Remove</button>
            <button type="button" className="btn" onClick={() => toast.show('Preview saved for posting')}>Keep</button>
          </div>
        </div>
      </div>
    )}
  </div>
  <div style={{ marginTop: 8 }}>
    <input className="input" placeholder="Tags (comma separated, optional)" value={tags} onChange={e => setTags(e.target.value)} />
  </div>
      <button className="btn" type="submit" disabled={loading}>{loading ? 'Posting...' : 'Post'}</button>
    </form>
  )
}
