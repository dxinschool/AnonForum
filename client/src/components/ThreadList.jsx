import React, { useEffect, useState, useRef } from 'react'
import API from '../api'
import { subscribe } from '../ws'
import { timeAgo } from '../time'
import { getVote, setVote } from '../voteLocal'
import admin from '../admin'
import Modal from './Modal'
import ImageLightbox from './ImageLightbox'
import toast from '../toast'

export default function ThreadList({ onOpen }) {
  const [threads, setThreads] = useState([])
  const [copied, setCopied] = useState(null)
  const [idCopied, setIdCopied] = useState(null)
  const [shareCopied, setShareCopied] = useState(null)
  const [page, setPage] = useState(1)
  const perPage = 5
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // search state (declared early so fetchPage can reference it)
  const [query, setQuery] = useState('')
  const qTimer = useRef(null)

  // reactions and polls maps
  // reactions map: { [threadId]: { emoji: count|{count,voters}, ... } }
  const [reactionsMap, setReactionsMap] = useState({})
  // polls map: { [threadId]: [poll, ...] }
  const [pollsMap, setPollsMap] = useState({})

  // fetch a page of threads (search q optional)
  const fetchPage = (q, p) => {
    const qp = p || page
    return API.listThreads(q || query, qp, perPage).then(res => {
      if (!res) return
      setThreads(res.items || [])
      setTotal(res.total || 0)
      setTotalPages(res.total_pages || Math.max(1, Math.ceil((res.total || 0) / perPage)))
      setPage(res.page || qp)
      // fetch reactions and polls for visible threads
      try {
        const ids = (res.items || []).map(t => t.id)
        ids.forEach(id => {
          API.getReactions('thread', id).then(r => {
            setReactionsMap(prev => ({ ...prev, [id]: r || {} }))
          }).catch(() => {})
          API.listPollsForThread(id).then(pl => {
            setPollsMap(prev => ({ ...prev, [id]: pl || [] }))
          }).catch(() => {})
        })
      } catch (e) { /* ignore */ }
    }).catch(err => { console.warn('fetchPage failed', err) })
  }

  useEffect(() => {
    fetchPage(query, page)
    const unsub = subscribe((msg) => {
      // refresh the current page on relevant updates so pagination stays consistent
      if (['thread', 'vote', 'delete_thread', 'comment', 'announcement'].includes(msg.type)) {
        fetchPage(query, page)
      }
      // update reaction aggregates live
      if (msg.type === 'reaction' && msg.data && msg.data.target_type === 'thread') {
        setReactionsMap(prev => ({ ...prev, [msg.data.target_id]: msg.data.reactions || {} }))
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
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerSrc, setViewerSrc] = useState(null)
  // share modal removed — Share button now copies permalink directly

  // poll voting from the list
  const handlePollVote = async (pollId, optionId, threadId) => {
    try {
      let voter = localStorage.getItem('anon_id')
      if (!voter) { voter = 'anon_' + Math.random().toString(36).slice(2,10); try { localStorage.setItem('anon_id', voter) } catch (e) {} }
      const out = await API.votePoll(pollId, optionId, voter)
      if (!out) { toast.show('Voted'); fetchPage(query, page); return }
      setPollsMap(prev => {
        const arr = prev[threadId] || []
        const next = arr.map(p => p.id === out.id ? out : p)
        return { ...prev, [threadId]: next }
      })
    } catch (e) { console.warn('poll vote failed', e); toast.show('Vote failed') }
  }

  const main = (
    <div>
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
          {t.image && <div style={{ marginBottom: 8 }}><img src={t.image} alt="thread" style={{ maxWidth: 240, maxHeight: 160, display: 'block', borderRadius: 6, cursor: 'pointer' }} onClick={() => { setViewerSrc(t.image); setViewerOpen(true) }} /></div>}
          {t.audio && (
            <div style={{ marginBottom: 8 }}>
              <audio controls src={t.audio} style={{ width: '100%', maxWidth: 320 }} />
            </div>
          )}
          <p>{t.body}</p>
          {t.comment_count > 0 && (
            <div className="thread-preview">
              <span className="thread-comments">💬 {t.comment_count} comment{t.comment_count !== 1 ? 's' : ''}</span>
              {t.top_comment && <span className="thread-top-comment">{(t.top_comment.body || '').slice(0, 140)}{(t.top_comment.body || '').length > 140 ? '…' : ''}</span>}
            </div>
          )}
          <div className="btn-group">
            <button className="btn" onClick={() => onOpen(t)}>Open</button>
            <button className="btn ghost" onClick={async () => {
              try {
                // copy share link that points to the frontend origin and includes the thread query so
                // opening the link will both show the /t/:id preview for crawlers and open the thread in the SPA
                const url = window.location.origin + '/t/' + encodeURIComponent(t.id) + '?thread=' + encodeURIComponent(t.id)
                await navigator.clipboard.writeText(url)
                toast.show('Link copied')
                setShareCopied(t.id)
                setTimeout(() => setShareCopied(null), 1500)
              } catch (e) { console.warn('copy failed', e); toast.show('Copy failed') }
            }}>{shareCopied === t.id ? 'Copied!' : 'Share'}</button>
            <button className="btn" onClick={async () => {
              try {
                const text = (t.title || '') + '\n\n' + (t.body || '')
                await navigator.clipboard.writeText(text)
                // quick visual feedback
                setCopied(t.id)
                setTimeout(() => setCopied(null), 1500)
              } catch (e) { console.warn('copy failed', e) }
            }}>{copied === t.id ? 'Copied!' : 'Copy'}</button>
            <button className="btn ghost" onClick={async () => {
              try {
                await navigator.clipboard.writeText(String(t.id))
                setIdCopied(t.id)
                toast.show('ID copied')
                setTimeout(() => setIdCopied(null), 1500)
              } catch (e) { console.warn('copy id failed', e); toast.show('Copy failed') }
            }}>{idCopied === t.id ? 'Copied!' : 'Copy ID'}</button>
            {adminToken && <button className="btn danger" onClick={async () => {
              setModalType('delete')
              setModalThread(t)
              setModalOpen(true)
            }}>Delete</button>}
            <button className="btn danger" onClick={async () => {
              // open report modal for this thread
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
          {/* reactions bar for quick reacting without opening thread */}
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            {['👍','❤️','😄','😮','😢','👎'].map(emoji => {
              const counts = reactionsMap[t.id] || {}
              // support two shapes from the server: { emoji: number } or { emoji: { count, voters } }
              const raw = counts[emoji]
              const cnt = (raw && typeof raw === 'object') ? (raw.count || 0) : (raw || 0)
              return (
                <button key={emoji} type="button" className="emoji-btn" onClick={async () => {
                  try {
                    // ensure anon id
                    let voter = localStorage.getItem('anon_id')
                    if (!voter) { voter = 'anon_' + Math.random().toString(36).slice(2,10); try { localStorage.setItem('anon_id', voter) } catch (e) {} }
                    console.debug('adding reaction', { thread: t.id, emoji, voter })
                    const out = await API.addReaction('thread', t.id, emoji, voter)
                    // validate response shape
                    if (!out || typeof out !== 'object') {
                      console.warn('unexpected reaction response', out)
                      toast.show('Reaction saved')
                      return
                    }
                    setReactionsMap(prev => ({ ...prev, [t.id]: out || {} }))
                  } catch (e) { console.warn('reaction failed', e); toast.show('Reaction failed') }
                }}>
                  <span style={{ marginRight: 6 }}>{emoji}</span>
                  <small style={{ color: 'var(--muted)' }}>{cnt}</small>
                </button>
              )
            })}
          </div>
          {/* inline polls (vote from list) */}
          {pollsMap[t.id] && pollsMap[t.id].length > 0 && pollsMap[t.id].map(poll => (
            <div key={poll.id} style={{ marginTop: 8, padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: 600 }}>{poll.question}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {(poll.options || []).map(opt => (
                  <button key={opt.id} className="btn small" onClick={async () => handlePollVote(poll.id, opt.id, t.id)}>
                    <span style={{ marginRight: 8 }}>{opt.label || opt.text || opt.name || ''}</span>
                    <small style={{ marginLeft: 6 }}>{opt.votes || 0}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      <div className="pagination">
        <button className="btn" disabled={page <= 1} onClick={() => { const np = Math.max(1, page - 1); setPage(np); fetchPage(query, np) }}>Prev</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ marginRight: 8 }}>Page</div>
          <input type="number" min={1} max={totalPages} value={page} onChange={e => setPage(Number(e.target.value || 1))} style={{ width: 72, padding: 8, borderRadius: 8, border: '1px solid rgba(15,23,42,0.06)' }} />
          <button className="btn" onClick={() => { const np = Math.max(1, Math.min(totalPages, page || 1)); setPage(np); fetchPage(query, np) }}>Go</button>
          <div style={{ marginLeft: 12 }}> / {totalPages} ({total} threads)</div>
        </div>
        <button className="btn" disabled={page >= totalPages} onClick={() => { const np = Math.min(totalPages, page + 1); setPage(np); fetchPage(query, np) }}>Next</button>
      </div>
    </div>
  )

  // modal confirm handlers
  const closeModal = () => { setModalOpen(false); setModalThread(null); setModalType(null) }
  const onConfirmModal = async () => {
    if (!modalThread) { closeModal(); return }
    try {
      if (modalType === 'delete') {
        await API.deleteThread(modalThread.id)
        toast.show('Thread deleted')
      } else if (modalType === 'report') {
        await API.report('thread', modalThread.id, modalReason || '')
        toast.show('Reported — thank you')
      }
    } catch (err) { console.warn('modal action failed', err); toast.show('Action failed') }
    closeModal()
  }

  return (
    <>
      {main}
  <ImageLightbox isOpen={viewerOpen} src={viewerSrc} onClose={() => setViewerOpen(false)} />
      <Modal isOpen={modalOpen} title={modalType === 'report' ? 'Report thread' : 'Confirm delete'} onCancel={closeModal} onConfirm={onConfirmModal} confirmText={modalType === 'report' ? 'Report' : 'Delete'}>
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
