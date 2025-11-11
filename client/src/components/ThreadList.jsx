import React, { useEffect, useState, useRef } from 'react'
import API from '../api'
import { subscribe } from '../ws'
import { timeAgo } from '../time'
import { getVote, setVote } from '../voteLocal'
import AdminPanel from './AdminPanel'
import admin from '../admin'

export default function ThreadList({ onOpen }) {
  const [threads, setThreads] = useState([])
  const [copied, setCopied] = useState(null)
  const [page, setPage] = useState(1)
  const perPage = 5
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // search state (declared early so fetchPage can reference it)
  const [query, setQuery] = useState('')
  const qTimer = useRef(null)

  // fetch a page of threads (search q optional)
  const fetchPage = (q, p) => {
    const qp = p || page
    return API.listThreads(q || query, qp, perPage).then(res => {
      if (!res) return
      setThreads(res.items || [])
      setTotal(res.total || 0)
      setTotalPages(res.total_pages || Math.max(1, Math.ceil((res.total || 0) / perPage)))
      setPage(res.page || qp)
    }).catch(err => { console.warn('fetchPage failed', err) })
  }

  useEffect(() => {
    fetchPage(query, page)
    const unsub = subscribe((msg) => {
      // refresh the current page on relevant updates so pagination stays consistent
      if (['thread', 'vote', 'delete_thread', 'comment', 'announcement'].includes(msg.type)) {
        fetchPage(query, page)
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    // debounce
    if (qTimer.current) clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => {
      // when searching reset to first page
      setPage(1)
      fetchPage(query, 1)
    }, 300)
    return () => { if (qTimer.current) clearTimeout(qTimer.current) }
  }, [query])

  // local vote state
  const [localVotes, setLocalVotes] = React.useState(() => {
    const map = {}
    try { const raw = localStorage.getItem('votes'); if (raw) Object.assign(map, JSON.parse(raw)) } catch (e) {}
    return map
  })

  // admin token state so UI updates without refresh
  const [adminToken, setAdminToken] = useState(() => admin.getToken())
  useEffect(() => {
    const unsub = admin.subscribe(t => setAdminToken(t))
    return unsub
  }, [])

  return (
    <div>
      <AdminPanel />
      <div style={{ marginBottom: 12 }}>
        <input className="input" placeholder="Search threads..." value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <h2>Recent threads</h2>
      {threads.length === 0 && <div>No threads found.</div>}
      {threads.map(t => (
        <div key={t.id} className="thread">
          <h3>{t.title}</h3>
          {t.tags && t.tags.length > 0 && (
            <div style={{ marginTop: 6, marginBottom: 6 }}>
              {t.tags.map(tag => (
                <span key={tag} style={{ display: 'inline-block', padding: '2px 8px', background: '#f1f1f1', borderRadius: 999, marginRight: 6, fontSize: 12 }}>{tag}</span>
              ))}
            </div>
          )}
          {t.image && <div style={{ marginBottom: 8 }}><img src={t.image} alt="thread" style={{ maxWidth: 240, maxHeight: 160, display: 'block', borderRadius: 6 }} /></div>}
          <p>{t.body}</p>
          {t.comment_count > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: '#444' }}>
              <span style={{ marginRight: 12 }}>💬 {t.comment_count} comment{t.comment_count !== 1 ? 's' : ''}</span>
              {t.top_comment && <span style={{ color: '#666' }}>{(t.top_comment.body || '').slice(0, 140)}{(t.top_comment.body || '').length > 140 ? '…' : ''}</span>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => onOpen(t)}>Open</button>
            <button className="btn" onClick={async () => {
              try {
                const text = (t.title || '') + '\n\n' + (t.body || '')
                await navigator.clipboard.writeText(text)
                // quick visual feedback
                setCopied(t.id)
                setTimeout(() => setCopied(null), 1500)
              } catch (e) { console.warn('copy failed', e) }
            }}>{copied === t.id ? 'Copied!' : 'Copy'}</button>
            {adminToken && <button className="btn" style={{ background: '#dc3545', color: '#fff' }} onClick={async () => {
              if (!confirm('Delete this thread?')) return
              try {
                await API.deleteThread(t.id)
              } catch (e) { console.warn('delete failed', e) }
            }}>Delete</button>}
            <button className="btn" style={{ background: '#dc3545', color: '#fff' }} onClick={async () => {
              try {
                const reason = prompt('Report this thread (optional reason):')
                if (reason === null) return
                await API.report('thread', t.id, reason || '')
                alert('Reported — thank you')
              } catch (err) { console.warn('report failed', err); alert('report failed') }
            }}>Report</button>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
              <button className="btn" onClick={async () => {
                try {
                  const cur = localVotes[t.id]
                  const want = 1
                  // toggle if same
                  const send = (cur === want) ? 1 : 1
                  await API.vote('thread', t.id, send)
                  // update localVotes: if cur === want then remove, else set to want
                  const next = { ...localVotes }
                  if (cur === want) { delete next[t.id]; setVote(t.id, null) }
                  else { next[t.id] = want; setVote(t.id, want) }
                  setLocalVotes(next)
                } catch (err) { console.warn('vote failed', err) }
              }} style={{ background: localVotes[t.id] === 1 ? '#28a745' : undefined, color: localVotes[t.id] === 1 ? '#fff' : undefined }}>▲</button>
              <button className="btn" onClick={async () => {
                try {
                  const cur = localVotes[t.id]
                  const want = -1
                  await API.vote('thread', t.id, want)
                  const next = { ...localVotes }
                  if (cur === want) { delete next[t.id]; setVote(t.id, null) }
                  else { next[t.id] = want; setVote(t.id, want) }
                  setLocalVotes(next)
                } catch (err) { console.warn('vote failed', err) }
              }} style={{ background: localVotes[t.id] === -1 ? '#dc3545' : undefined, color: localVotes[t.id] === -1 ? '#fff' : undefined }}>▼</button>
              <div style={{ marginLeft: 8 }}><small>score: {t.score ?? 0}</small> — <small>{timeAgo(t.created_at)}</small></div>
            </div>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button className="btn" disabled={page <= 1} onClick={() => { const np = Math.max(1, page - 1); setPage(np); fetchPage(query, np) }}>Prev</button>
        <div>Page {page} / {totalPages} ({total} threads)</div>
        <button className="btn" disabled={page >= totalPages} onClick={() => { const np = Math.min(totalPages, page + 1); setPage(np); fetchPage(query, np) }}>Next</button>
      </div>
    </div>
  )
}
