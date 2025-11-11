import React, { useEffect, useState } from 'react'
import API from '../api'
import { subscribe } from '../ws'
import { timeAgo } from '../time'
import { getVote, setVote } from '../voteLocal'
import AdminPanel from './AdminPanel'
import toast from '../toast'

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
  const [replyTo, setReplyTo] = useState(null)
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!threadId) return
    API.getThread(threadId).then(setData)
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
    })
    return () => unsub()
  }, [threadId])

  const [myVote, setMyVote] = React.useState(() => getVote(threadId))

  useEffect(() => {
    setMyVote(getVote(threadId))
  }, [threadId])

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
    <div>
      <AdminPanel />
      <div className="thread">
        <h2>{data.thread.title}</h2>
        {data.thread.tags && data.thread.tags.length > 0 && (
          <div className="tags">
            {data.thread.tags.map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}
        {data.thread.image && <div style={{ marginBottom: 12 }}><img src={data.thread.image} alt="thread" style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 6 }} /></div>}
        <p>{data.thread.body}</p>
        <div className="btn-group" style={{ marginTop: 8 }}>
          <button className="btn" onClick={async () => {
            try {
              const text = (data.thread.title || '') + '\n\n' + (data.thread.body || '')
              await navigator.clipboard.writeText(text)
              toast.show('Copied to clipboard')
            } catch (e) { console.warn('copy failed', e); toast.show('Copy failed') }
          }}>Copy</button>
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
        </div>
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
  )
}
