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
  const [pollQuestion, setPollQuestion] = useState('')
  // interactive options array instead of a raw textarea
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [createPoll, setCreatePoll] = useState(false)

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
      try {
        if (file) {
          t = await API.createThreadWithFile(title, body, file, tags)
        } else {
          t = await API.createThread(title, body, tags)
        }
      } catch (err) {
        console.warn('create thread failed', err)
        // show a red/error toast to warn the user (e.g. blocklist word)
        try { toast.show(err && err.message ? err.message : 'Post failed', { type: 'error' }) } catch (e) { /* ignore */ }
        return
      }
      // if poll requested, create poll
      if (createPoll && pollQuestion.trim()) {
        try {
          const options = (pollOptions || []).map(s => String(s || '').trim()).filter(Boolean).slice(0, 6)
          if (options.length >= 2) {
            await API.createPoll(t.id, pollQuestion, options)
          }
        } catch (e) { console.warn('create poll failed', e) }
      }
      setTitle('')
      setBody('')
      setFile(null)
      setTags('')
      setPollQuestion('')
      setPollOptions(['', ''])
      setCreatePoll(false)
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
    <input id="thread-file-input" type="file" accept="image/*,audio/*" onChange={e => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
    <label htmlFor="thread-file-input" className="btn ghost small" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M21 15V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 13l3-3 4 4 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Attach image
    </label>
    {preview && (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        {file && file.type && file.type.startsWith('audio/') ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <audio src={preview} controls style={{ maxWidth: 240 }} />
            <div className="file-name" style={{ fontSize: 13, color: '#374151' }}>{file ? file.name : ''} <small style={{ color: '#6b7280' }}>({file ? Math.round(file.size/1024) : ''} KB)</small></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn secondary small" onClick={() => { setFile(null); setPreview(null) }}>Remove</button>
              <button type="button" className="btn" onClick={() => toast.show('Preview saved for posting')}>Keep</button>
            </div>
          </div>
        ) : (
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
    )}
  </div>
  <div style={{ marginTop: 8 }}>
    <input className="input" placeholder="Tags (comma separated, optional)" value={tags} onChange={e => setTags(e.target.value)} />
  </div>
  <div style={{ marginTop: 8 }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="checkbox" checked={createPoll} onChange={e => setCreatePoll(e.target.checked)} /> Create poll
    </label>
    {createPoll && (
      <div style={{ marginTop: 8 }}>
        <input className="input" placeholder="Poll question" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} />
        <div style={{ marginTop: 6 }}>
          {(pollOptions || []).map((opt, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input className="input" placeholder={`Option ${idx + 1}`} value={opt} onChange={e => {
                const arr = [...pollOptions]; arr[idx] = e.target.value; setPollOptions(arr)
              }} />
              <button type="button" className="btn secondary small" onClick={() => {
                // remove option (but keep minimum 2)
                if ((pollOptions || []).length <= 2) return
                const arr = [...pollOptions]; arr.splice(idx, 1); setPollOptions(arr)
              }}>Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn small" onClick={() => {
              if ((pollOptions || []).length >= 6) return toast.show('Max 6 options')
              setPollOptions([...(pollOptions || []), ''])
            }}>Add option</button>
            <small style={{ color: '#6b7280', alignSelf: 'center' }}>Min 2 options, max 6</small>
          </div>
        </div>
      </div>
    )}
  </div>
      <button className="btn" type="submit" disabled={loading}>{loading ? 'Posting...' : 'Post'}</button>
    </form>
  )
}
