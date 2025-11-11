import React, { useState, useEffect } from 'react'
import API from '../api'
import admin from '../admin'
import { subscribe } from '../ws'

export default function AdminPanel() {
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(() => admin.getToken())
  const [error, setError] = useState(null)
  const [announce, setAnnounce] = useState('')
  const [rulesText, setRulesText] = useState('')
  const [reports, setReports] = useState([])

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
        <strong>Reports</strong>
        {reports.length === 0 && <div style={{ marginTop: 6 }}>No reports</div>}
        {reports.map(r => (
          <div key={r.id} style={{ marginTop: 8, padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
            <div><small>{r.target_type} {r.target_id} — {new Date(r.created_at * 1000).toLocaleString()}</small></div>
            <div style={{ marginTop: 6 }}>{r.reason}</div>
            <div style={{ marginTop: 8 }}>
              {!r.resolved && <button className="btn" onClick={() => resolve(r.id)}>Resolve</button>}
              {r.resolved && <span style={{ color: '#666' }}>Resolved</span>}
            </div>
          </div>
        ))}
      </div>
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
