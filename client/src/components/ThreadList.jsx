import React, { useEffect, useState, useRef } from 'react'
import API from '../api'
import { subscribe } from '../ws'
import { timeAgo } from '../time'
import { getVote, setVote } from '../voteLocal'
import AdminPanel from './AdminPanel'
import admin from '../admin'
import Modal from './Modal'
import toast from '../toast'

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

  // modal state for delete/report
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState(null)
  const [modalThread, setModalThread] = useState(null)
  const [modalReason, setModalReason] = useState('')

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
            <div className="tags">
              {t.tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          )}
          {t.image && <div style={{ marginBottom: 8 }}><img src={t.image} alt="thread" style={{ maxWidth: 240, maxHeight: 160, display: 'block', borderRadius: 6 }} /></div>}
          <p>{t.body}</p>
          {t.comment_count > 0 && (
            <div className="thread-preview">
              <span className="thread-comments">💬 {t.comment_count} comment{t.comment_count !== 1 ? 's' : ''}</span>
              {t.top_comment && <span className="thread-top-comment">{(t.top_comment.body || '').slice(0, 140)}{(t.top_comment.body || '').length > 140 ? '…' : ''}</span>}
            </div>
          )}
          <div className="btn-group">
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
            {adminToken && <button className="btn danger" onClick={async () => {
              setModalType('delete')
              setModalThread(t)
              setModalReason('')
              setModalOpen(true)
            }}>Delete</button>}
            <button className="btn danger" onClick={async () => {
              setModalType('report')
              setModalThread(t)
              setModalReason('')
              setModalOpen(true)
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
  
  // modal confirm handlers
  const closeModal = () => { setModalOpen(false); setModalThread(null); setModalType(null); setModalReason('') }
  const onConfirmModal = async () => {
    if (!modalThread) { closeModal(); return }
    try {
      if (modalType === 'delete') {
        await API.deleteThread(modalThread.id)
        toast.show('Thread deleted')
      }
      if (modalType === 'report') {
        await API.report('thread', modalThread.id, modalReason || '')
        toast.show('Reported — thank you')
      }
    } catch (err) { console.warn('modal action failed', err); toast.show('Action failed') }
    closeModal()
  }

  return (
    <>
      <div>
        {/* existing return content is above; this function only changed the flow — kept return at top by moving modal outside earlier return in code */}
      </div>
      <Modal isOpen={modalOpen} title={modalType === 'delete' ? 'Confirm delete' : 'Report thread'} onCancel={closeModal} onConfirm={onConfirmModal} confirmText={modalType === 'delete' ? 'Delete' : 'Report'}>
        {modalType === 'report' ? (
          <div>
            <div style={{ marginBottom: 8 }}>Report thread <strong>{modalThread && modalThread.title}</strong></div>
            <textarea className="input" rows={4} placeholder="Optional reason" value={modalReason} onChange={e => setModalReason(e.target.value)} />
          </div>
        ) : (
          <div>Are you sure you want to delete <strong>{modalThread && modalThread.title}</strong>? This action cannot be undone.</div>
        )}
      </Modal>
    </>
  )
}
