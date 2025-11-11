import React, { useEffect, useState } from 'react'
import ThreadList from './components/ThreadList'
import Thread from './components/Thread'
import NewThread from './components/NewThread'
import Chat from './components/Chat'
import Announcement from './components/Announcement'
import Rules from './components/Rules'
import ToastContainer from './components/ToastContainer'

export default function App() {
  const [page, setPage] = useState('list')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    // nothing for now
  }, [])

  return (
    <div className="container">
      <h1>Anonymous Forum</h1>
      <Announcement />
  <Rules />
  <ToastContainer />
      {page === 'list' && (
        <>
          <NewThread onCreate={(t) => { setSelected(t); setPage('thread') }} />
          <ThreadList onOpen={(t) => { setSelected(t); setPage('thread') }} />
        </>
      )}
      {page === 'thread' && selected && (
        <div>
          <button className="btn secondary" onClick={() => setPage('list')}>Back</button>
          <Thread threadId={selected.id} />
        </div>
      )}
      <Chat />
    </div>
  )
}
