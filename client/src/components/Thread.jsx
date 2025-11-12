import React, { useEffect, useState } from 'react'
import API from '../api'
import { subscribe } from '../ws'
import { timeAgo } from '../time'
import { getVote, setVote } from '../voteLocal'
import toast from '../toast'
import ImageLightbox from './ImageLightbox'

function Comment({ c, onReply }) {
  return (
    <div className="comment">
      <div style={{ fontSize: 12, color: '#555' }}><small>score: {c.score}</small> — <small>{timeAgo(c.created_at)}</small></div>
      <div style={{ marginTop: 6 }}>{c.body}</div>
      <div style={{ marginTop: 6 }}>
        <button className="btn" onClick={() => onReply(c.id)}>Reply</button>
      </div>
    </div>
  )
}

export default function Thread({ threadId }) {
  const [data, setData] = useState(null)
  const [reactions, setReactions] = useState({})
  const [replyTo, setReplyTo] = useState(null)
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!threadId) return
    API.getThread(threadId).then(setData)
    // fetch reactions for this thread
    API.getReactions('thread', threadId).then(r => { if (r) setReactions(r) }).catch(() => {})
    // fetch polls for this thread
    API.listPollsForThread(threadId).then(ps => {
      if (Array.isArray(ps)) setPolls(ps)
    }).catch(() => {})
    const unsub = subscribe((msg) => {
      if (msg.type === 'comment') {
        const c = msg.data
        if (c.thread_id === threadId) {
          setData(prev => prev ? { thread: prev.thread, comments: [...prev.comments, c] } : { thread: null, comments: [c] })
        }
      }
      if (msg.type === 'vote') {
        const { target_type, target_id, updated } = msg.data
        if (target_type === 'thread' && target_id === threadId) {
          setData(prev => prev ? { thread: { ...prev.thread, score: updated.score, upvotes: updated.upvotes, downvotes: updated.downvotes }, comments: prev.comments } : prev)
        }
        if (target_type === 'comment') {
          setData(prev => prev ? { thread: prev.thread, comments: prev.comments.map(c => c.id === target_id ? { ...c, score: updated.score } : c) } : prev)
        }
      }
      if (msg.type === 'reaction') {
        const d = msg.data || {}
        if (d.target_type === 'thread' && d.target_id === threadId) {
          setReactions(d.reactions || {})
        }
      }
    })
    return () => unsub()
  }, [threadId])

  const [myVote, setMyVote] = React.useState(() => getVote(threadId))
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSrc, setPreviewSrc] = useState(null)
  const [polls, setPolls] = useState([])
  // share modal removed — clicking Share now copies permalink to clipboard
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => {
    setMyVote(getVote(threadId))
  }, [threadId])

  const votePoll = async (pollId, optionId) => {
    try {
      let voter = localStorage.getItem('anon_id')
      if (!voter) { voter = 'anon_' + Math.random().toString(36).slice(2,10); try { localStorage.setItem('anon_id', voter) } catch(e){} }
      const res = await API.votePoll(pollId, optionId, voter)
      // update poll in local state
      setPolls(prev => prev.map(p => p.id === pollId ? res : p))
      try { localStorage.setItem('poll_vote_' + pollId, optionId) } catch (e) {}
    } catch (e) { console.warn('vote poll failed', e) }
  }

  const postComment = async (e) => {
    e.preventDefault()
    if (!body.trim()) return
    const COMMENT_MAX = 1000
    if (body.length > COMMENT_MAX) return alert(`Comment too long (max ${COMMENT_MAX})`)
    const res = await API.postComment(threadId, replyTo, body)
    setBody('')
    setReplyTo(null)
    // reload
    const fresh = await API.getThread(threadId)
    setData(fresh)
  }

  if (!data) return <div>Loading...</div>

  return (
    <>
    <div>
      <div className="thread">
        <h2>{data.thread.title}</h2>
        {data.thread.tags && data.thread.tags.length > 0 && (
          <div className="tags">
            {data.thread.tags.map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}
        {data.thread.image && (
          <div style={{ marginBottom: 12 }}>
            <img src={data.thread.image} alt="thread" style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 6, cursor: 'pointer' }} onClick={() => { setPreviewSrc(data.thread.image); setPreviewOpen(true) }} />
          </div>
        )}
        <p>{data.thread.body}</p>
        <div className="btn-group" style={{ marginTop: 8 }}>
          <button className="btn" onClick={async () => {
            try {
              const text = (data.thread.title || '') + '\n\n' + (data.thread.body || '')
              await navigator.clipboard.writeText(text)
              toast.show('Copied to clipboard')
            } catch (e) { console.warn('copy failed', e); toast.show('Copy failed') }
          }}>Copy</button>
          <button className="btn ghost" onClick={async () => {
            try {
              // include the thread query so opening the share URL both provides the /t/:id preview
              // and causes the SPA to open the thread when visited by a human
              const url = window.location.origin + '/t/' + encodeURIComponent(data.thread.id) + '?thread=' + encodeURIComponent(data.thread.id)
              await navigator.clipboard.writeText(url)
              toast.show('Link copied')
              setShareCopied(true)
              setTimeout(() => setShareCopied(false), 1500)
            } catch (e) { console.warn('copy failed', e); toast.show('Copy failed') }
          }}>{shareCopied ? 'Copied!' : 'Share'}</button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn" onClick={async () => {
                try {
                  const cur = getVote(data.thread.id)
                  const want = 1
                  await API.vote('thread', data.thread.id, want)
                  if (cur === want) { setVote(data.thread.id, null); setMyVote(null) }
                  else { setVote(data.thread.id, want); setMyVote(want) }
                } catch (err) { console.warn('vote failed', err) }
              }} style={{ background: myVote === 1 ? '#28a745' : undefined, color: myVote === 1 ? '#fff' : undefined }}>▲</button>
              <button className="btn" onClick={async () => {
                try {
                  const cur = getVote(data.thread.id)
                  const want = -1
                  await API.vote('thread', data.thread.id, want)
                  if (cur === want) { setVote(data.thread.id, null); setMyVote(null) }
                  else { setVote(data.thread.id, want); setMyVote(want) }
                } catch (err) { console.warn('vote failed', err) }
              }} style={{ background: myVote === -1 ? '#dc3545' : undefined, color: myVote === -1 ? '#fff' : undefined }}>▼</button>
            </div>
            <div><small>score: {data.thread.score}</small> — <small>{timeAgo(data.thread.created_at)}</small></div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 12 }}>
            {/* Simple reaction button set */}
            {['👍','❤️','😂','😮','😢','😡'].map(emo => (
              <button key={emo} className="btn" onClick={async () => {
                try {
                  // use anon voter id similar to votes
                  let voter = localStorage.getItem('anon_id')
                  if (!voter) { voter = 'anon_' + Math.random().toString(36).slice(2,10); try { localStorage.setItem('anon_id', voter) } catch(e){} }
                  const out = await API.addReaction('thread', data.thread.id, emo, voter)
                  if (out) setReactions(out)
                } catch (e) { console.warn('reaction failed', e) }
              }}>{emo} {reactions[emo] ? reactions[emo].count : ''}</button>
            ))}
          </div>
        </div>
        {/* Polls (show first poll if any) */}
        {polls && polls.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {polls.map(poll => {
              const total = (poll.options || []).reduce((s, o) => s + (o.votes || 0), 0)
              const myVote = (() => { try { return localStorage.getItem('poll_vote_' + poll.id) } catch (e) { return null } })()
              return (
                <div key={poll.id} style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--card-bg, #fff)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ fontWeight: 700 }}>{poll.question}</div>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(poll.options || []).map(opt => {
                      const votes = opt.votes || 0
                      const pct = total > 0 ? Math.round((votes / total) * 100) : 0
                      const selected = myVote === opt.id
                      return (
                        <div key={opt.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: selected ? 700 : 500 }}>{opt.label}</div>
                            <div style={{ color: '#666' }}>{votes} · {pct}%</div>
                          </div>
                          <div style={{ height: 10, background: 'rgba(0,0,0,0.06)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: selected ? '#2563eb' : '#60a5fa' }} />
                          </div>
                          {!myVote && (
                            <div>
                              <button className="btn" onClick={() => votePoll(poll.id, opt.id)}>Vote</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <h3>Comments</h3>
      <div>
        {data.comments.map(c => (
          <Comment key={c.id} c={c} onReply={(id) => setReplyTo(id)} />
        ))}
      </div>

      <form onSubmit={postComment} style={{ marginTop: 12 }}>
        {replyTo && <div>Replying to {replyTo} <button type="button" onClick={() => setReplyTo(null)}>cancel</button></div>}
        <textarea className="input" rows={4} value={body} onChange={e => setBody(e.target.value)} />
        <button className="btn" type="submit">Post Comment</button>
      </form>
    </div>
  <ImageLightbox isOpen={previewOpen} src={previewSrc} onClose={() => setPreviewOpen(false)} />
    </>
  )
}
