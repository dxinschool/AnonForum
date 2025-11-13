import React, { useState, useEffect } from 'react'
import API from '../api'
import admin from '../admin'
import { subscribe } from '../ws'
import toast from '../toast'
import Modal from './Modal'

export default function AdminPanel() {
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(() => admin.getToken())
  const [error, setError] = useState(null)
  const [announce, setAnnounce] = useState('')
  const [rulesText, setRulesText] = useState('')
  const [reports, setReports] = useState([])
  const [blocklist, setBlocklist] = useState([])
  const [audit, setAudit] = useState([])
  const [blocklistEdit, setBlocklistEdit] = useState('')

  useEffect(() => {
    const unsub = admin.subscribe(t => setToken(t))
    return unsub
  }, [])

  const login = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await API.adminLogin(password)
      if (res && res.token) {
        admin.setToken(res.token)
      } else {
        setError('invalid password')
      }
    } catch (err) { setError('failed') }
  }

  const logout = () => {
    admin.setToken(null)
  }

  const postAnnouncement = async (e) => {
    e.preventDefault()
    try {
      await API.adminAnnounce(announce)
      setAnnounce('')
    } catch (err) { console.warn('announce failed', err) }
  }

  const clearAnnouncement = async () => {
    try {
      await API.adminAnnounce('')
      setAnnounce('')
    } catch (err) { console.warn('clear announce failed', err) }
  }

  // fetch admin-only data (reports) and current rules when logged in
  useEffect(() => {
    let mounted = true
    if (token) {
      API.listReports().then(r => { if (mounted) setReports(r || []) }).catch(() => {})
      API.getRules().then(r => { if (mounted && r) setRulesText(r.text || '') }).catch(() => {})
      // fetch blocklist and audit
      API.adminGetBlocklist().then(b => { if (mounted) { setBlocklist(b || []); setBlocklistEdit((b || []).join('\n')) } }).catch(() => {})
      API.adminListAudit().then(a => { if (mounted) setAudit(a || []) }).catch(() => {})
    }
    // subscribe to report updates via websocket so admin UI updates live
    const unsubWS = subscribe((msg) => {
      if (!token) return // only update when admin logged in
      if (msg.type === 'report') {
        setReports(prev => [msg.data, ...(prev || [])])
      }
      if (msg.type === 'report_resolved') {
        setReports(prev => (prev || []).map(r => r.id === msg.data.id ? msg.data : r))
      }
      if (msg.type === 'report_deleted') {
        setReports(prev => (prev || []).filter(r => r.id !== (msg.data && msg.data.id)))
      }
    })
    return () => { mounted = false; unsubWS() }
  }, [token])

  const postRules = async (e) => {
    e.preventDefault()
    try {
      await API.adminSetRules(rulesText)
    } catch (err) { console.warn('set rules failed', err) }
  }

  const resolve = async (id) => {
    try {
      await API.resolveReport(id)
      // refresh
      const r = await API.listReports()
      setReports(r || [])
    } catch (err) { console.warn('resolve failed', err) }
  }

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [toDeleteReport, setToDeleteReport] = useState(null)

  const openDeleteModal = (report) => {
    setToDeleteReport(report)
    setDeleteModalOpen(true)
  }

  const closeDeleteModal = () => {
    setToDeleteReport(null)
    setDeleteModalOpen(false)
  }

  const confirmDeleteReport = async () => {
    if (!toDeleteReport) return
    try {
      await API.deleteReport(String(toDeleteReport.id))
      toast.show('Report removed')
      // remove the report entry from the list
      setReports(prev => (prev || []).filter(r => r.id !== toDeleteReport.id))
    } catch (err) { console.warn('delete report failed', err); toast.show('Delete failed') }
    closeDeleteModal()
  }

  const saveBlocklist = async () => {
    try {
      const arr = (blocklistEdit || '').split('\n').map(s => s.trim()).filter(Boolean)
      const saved = await API.adminSetBlocklist(arr)
      setBlocklist(saved || [])
      toast.show('Blocklist saved')
    } catch (e) { console.warn('save blocklist failed', e); toast.show('Save failed') }
  }

  const refreshAudit = async () => {
    try {
      const rows = await API.adminListAudit()
      setAudit(rows || [])
      toast.show('Audit refreshed')
    } catch (e) { console.warn('refresh audit failed', e); toast.show('Refresh failed') }
  }

  const copyId = async (id) => {
    try {
      await navigator.clipboard.writeText(String(id))
      toast.show('Copied to clipboard')
    } catch (e) { console.warn('copy failed', e); toast.show('Copy failed') }
  }

  // normalize audit to an array shape for rendering
  const auditList = Array.isArray(audit)
    ? audit
    : (audit && audit.items && Array.isArray(audit.items) ? audit.items : [])

  if (token) return (
    <div style={{ marginBottom: 12 }}>
      <strong>Admin:</strong> <small style={{ color: '#28a745' }}>logged in</small>
      <button className="btn" style={{ marginLeft: 8 }} onClick={logout}>Logout</button>
      <form onSubmit={postAnnouncement} style={{ marginTop: 8 }}>
        <textarea className="input" rows={2} placeholder="Site announcement (empty to clear)" value={announce} onChange={e => setAnnounce(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="submit">Post Announcement</button>
          <button className="btn secondary" type="button" onClick={clearAnnouncement}>Clear Announcement</button>
        </div>
      </form>
      <form onSubmit={postRules} style={{ marginTop: 8 }}>
        <textarea className="input" rows={3} placeholder="Community rules" value={rulesText} onChange={e => setRulesText(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="submit">Set Rules</button>
          <button className="btn secondary" type="button" onClick={async () => {
            try {
              await API.adminSetRules('')
              setRulesText('')
            } catch (err) { console.warn('clear rules failed', err) }
          }}>Clear Rules</button>
        </div>
      </form>

      <div style={{ marginTop: 12 }}>
        <strong>Site Control</strong>
        <div className="admin-grid" style={{ marginTop: 8 }}>
          <div className="admin-panel admin-blocklist">
            <strong>Blocklist</strong>
            <small style={{ display: 'block', color: '#6b7280' }}>One word or phrase per line</small>
            <textarea className="input" rows={6} value={blocklistEdit} onChange={e => setBlocklistEdit(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn" onClick={saveBlocklist}>Save blocklist</button>
              <button className="btn secondary" onClick={() => { setBlocklistEdit((blocklist || []).join('\n')) }}>Reset</button>
            </div>
          </div>
          <div className="admin-panel admin-audit">
            <strong>Audit log</strong>
            <div className="audit-list">
              <div style={{ marginBottom: 8 }}>
                <button className="btn small" onClick={refreshAudit}>Refresh</button>
              </div>
              {auditList.slice(0, 50).map(a => (
                <div key={a.id} className="audit-row">
                  <div className="audit-action">{a.action} <small className="muted-small">{a.admin_token ? 'admin' : ''}</small></div>
                  <div className="audit-time">{new Date((a.ts || a.created_at || Math.floor(Date.now()/1000)) * 1000).toLocaleString()}</div>
                  <div className="audit-details">{JSON.stringify(a.details || {})}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <hr style={{ margin: '12px 0' }} />

        <strong>Reports</strong>
        {reports.length === 0 && <div style={{ marginTop: 6 }}>No reports</div>}
        {reports.map(r => (
          <div key={r.id} className="report-row" style={{ marginTop: 8, padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
            <div>
              <small>
                {r.target_type} <span className="id-chip">{r.target_id}</span>
                <button className="btn small ghost" style={{ marginLeft: 8 }} onClick={() => copyId(r.target_id)}>Copy</button>
                {' '}— {new Date(r.created_at * 1000).toLocaleString()}
              </small>
            </div>
            <div style={{ marginTop: 6 }}>{r.reason}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              {!r.resolved && <button className="btn" onClick={() => resolve(r.id)}>Resolve</button>}
              {r.resolved && <>
                <span style={{ color: '#666' }}>Resolved</span>
                <button className="btn danger" onClick={() => openDeleteModal(r)} style={{ marginLeft: 8 }}>Delete</button>
              </>}
            </div>
          </div>
        ))}
      </div>
      <Modal isOpen={deleteModalOpen} title="Confirm delete report" onCancel={closeDeleteModal} onConfirm={confirmDeleteReport} confirmText="Delete report" cancelText="Cancel">
        Are you sure you want to remove this report for thread {toDeleteReport ? String(toDeleteReport.target_id) : ''}? This will remove the report message from the queue.
      </Modal>
    </div>
  )

  return (
    <form onSubmit={login} style={{ marginBottom: 12 }}>
      <input className="input" type="password" placeholder="Admin password" value={password} onChange={e => setPassword(e.target.value)} />
      <button className="btn" type="submit">Admin Login</button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </form>
  )
}
