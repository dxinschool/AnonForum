import React, { useEffect, useState } from 'react'
import API from '../api'
import { subscribe } from '../ws'

export default function Announcement() {
  const [ann, setAnn] = useState(null)

  useEffect(() => {
    API.getAnnouncement().then((a) => {
      // server may return { text } or just a string
      if (!a) return
      if (typeof a === 'string') setAnn({ text: a })
      else if (a.text) setAnn(a)
      else setAnn({ text: String(a) })
    }).catch(() => {})
    const unsub = subscribe((msg) => {
      if (msg.type === 'announcement') setAnn(msg.data)
    })
    return () => unsub()
  }, [])

  if (!ann) return null
  const text = typeof ann === 'string' ? ann : ann.text
  if (!text) return null
  return (
    <div className="notice announcement">
      <span className="notice-body">{text}</span>
    </div>
  )
}
