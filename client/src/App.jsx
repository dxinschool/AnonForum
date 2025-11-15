import React, { useEffect, useState } from 'react'
import ThreadList from './components/ThreadList'
import Thread from './components/Thread'
import NewThread from './components/NewThread'
import Chat from './components/Chat'
import Announcement from './components/Announcement'
import Rules from './components/Rules'
import ToastContainer from './components/ToastContainer'
import AdminPanel from './components/AdminPanel'
import AnimatedModal from './components/AnimatedModal'
import ContactAdmin from './components/ContactAdmin.jsx'
// contact admin removed

export default function App() {
  const [page, setPage] = useState('list')
  const [selected, setSelected] = useState(null)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('theme', theme) } catch (e) {}
  }, [theme])

  // Apply theme and optionally animate via the .theme-transition helper
  const applyTheme = (newTheme, animate = false) => {
    try {
      if (animate) {
        document.documentElement.classList.add('theme-transition')
        // remove after the CSS transition completes
        window.setTimeout(() => document.documentElement.classList.remove('theme-transition'), 340)
      }
      document.documentElement.setAttribute('data-theme', newTheme)
      setTheme(newTheme)
      try { localStorage.setItem('theme', newTheme) } catch (e) {}
    } catch (e) { /* ignore */ }
  }

  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    // initialize from URL ?thread=<id> so share links open directly
    // also support paths like /t/:id or /t/:id?thread=:id so frontends can host
    // share links at /t/<id>?thread=<id>
    const params = new URLSearchParams(window.location.search)
    let tid = params.get('thread')
    if (!tid) {
      // try reading /t/:id from pathname
      const m = window.location.pathname.match(/^\/t\/([^\/\?]+)/)
      if (m && m[1]) {
        tid = decodeURIComponent(m[1])
        // add thread query param to URL without reloading so history stays clean
        const newUrl = window.location.pathname + '?thread=' + encodeURIComponent(tid)
        try { window.history.replaceState(null, '', newUrl) } catch (e) {}
      }
    }
    if (tid) {
      setSelected({ id: tid })
      setPage('thread')
    }
    // handle back/forward navigation
    const onPop = () => {
      const p = new URLSearchParams(window.location.search)
      const t = p.get('thread')
      if (t) { setSelected({ id: t }); setPage('thread') }
      else { setSelected(null); setPage('list') }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return (
    <div className="container">
      <div className="app-header">
        <h1>Anonymous Forum</h1>
        <button className="hamburger" aria-label="Open menu" onClick={() => setShowMenu(s => !s)}>☰</button>
        <div className="header-actions">
          <button className="btn" onClick={() => setShowChat(s => !s)}>{showChat ? 'Close Chat' : 'Open Chat'}</button>
          <button className="btn" onClick={() => setShowAdmin(s => !s)}>{showAdmin ? 'Close Admin' : 'Admin'}</button>
          <button className="btn" onClick={() => setShowContact(s => !s)}>{showContact ? 'Close' : 'Contact Admin'}</button>
          <button className="btn" onClick={() => {
            const next = theme === 'light' ? 'dark' : 'light'
            applyTheme(next, true)
          }}>{theme === 'light' ? 'Dark' : 'Light'}</button>
        </div>

        <div className={"mobile-actions" + (showMenu ? ' open' : '')} role="menu">
          <button className="btn" onClick={() => { setShowChat(s => !s); setShowMenu(false) }}>{showChat ? 'Close Chat' : 'Open Chat'}</button>
          <button className="btn" onClick={() => { setShowAdmin(s => !s); setShowMenu(false) }}>{showAdmin ? 'Close Admin' : 'Admin'}</button>
          <button className="btn" onClick={() => { setShowContact(s => !s); setShowMenu(false) }}>{showContact ? 'Close' : 'Contact Admin'}</button>
          <button className="btn" onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; applyTheme(next, true); setShowMenu(false) }}>{theme === 'light' ? 'Dark' : 'Light'}</button>
        </div>
      </div>
      <Announcement />
  <Rules />
  <ToastContainer />
      <AnimatedModal visible={showAdmin} onClose={() => setShowAdmin(false)}>
        <AdminPanel />
      </AnimatedModal>
      
      <AnimatedModal visible={showChat} onClose={() => setShowChat(false)}>
        <Chat />
      </AnimatedModal>
      <AnimatedModal visible={showContact} onClose={() => setShowContact(false)} width={480} height={'auto'}>
        <ContactAdmin onClose={() => setShowContact(false)} />
      </AnimatedModal>
      {page === 'list' && (
        <>
          <NewThread onCreate={(t) => { setSelected(t); setPage('thread'); window.history.replaceState(null, '', '?thread=' + t.id) }} />
          <ThreadList onOpen={(t) => { setSelected(t); setPage('thread'); window.history.replaceState(null, '', '?thread=' + t.id) }} />
        </>
      )}
      {page === 'thread' && selected && (
        <div>
          <button className="btn secondary" onClick={() => { setPage('list'); setSelected(null); window.history.replaceState(null, '', window.location.pathname) }}>Back</button>
          <Thread threadId={selected.id} />
        </div>
      )}
      {/* Chat is shown via the modal above when Open Chat is clicked */}
    </div>
  )
}
