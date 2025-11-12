import React from 'react'
import Modal from './Modal'
import { timeAgo } from '../time'
import toast from '../toast'

export default function ShareEmbed({ isOpen, thread, onClose }) {
  if (!isOpen || !thread) return null
  const url = window.location.origin + '/t/' + encodeURIComponent(thread.id)
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); toast.show('Link copied') } catch (e) { console.warn('copy failed', e); toast.show('Copy failed') }
  }
  const shareNative = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: thread.title, text: (thread.body || '').slice(0, 240), url }) } catch (e) { /* ignore */ }
    } else {
      copyLink()
    }
  }

  return (
    <Modal isOpen={isOpen} title="Share thread" onCancel={onClose} onConfirm={copyLink} confirmText="Copy link" cancelText="Close">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {thread.image && <img src={thread.thumb || thread.image} alt="thumb" style={{ width: 120, height: 84, objectFit: 'cover', borderRadius: 8 }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{thread.title}</div>
          <div style={{ marginTop: 6, color: '#444' }}>{(thread.body || '').slice(0, 200)}{(thread.body || '').length > 200 ? '…' : ''}</div>
          <div style={{ marginTop: 8, color: '#666', display: 'flex', gap: 12, alignItems: 'center' }}>
            <small>score: {thread.score ?? 0}</small>
            <small>{timeAgo(thread.created_at)}</small>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn ghost" type="button" onClick={shareNative}>Share</button>
        <button className="btn" type="button" onClick={copyLink}>Copy link</button>
      </div>
    </Modal>
  )
}
