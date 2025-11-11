import React, { useEffect, useState } from 'react'
import API from '../api'
import { subscribe } from '../ws'

export default function Rules() {
  const [rules, setRules] = useState(null)

  useEffect(() => {
    API.getRules().then(setRules).catch(() => {})
    const unsub = subscribe((msg) => { if (msg.type === 'rules') setRules(msg.data) })
    return unsub
  }, [])

  if (!rules || !rules.text) return null
  return (
    <div style={{ background: '#e9f7ef', border: '1px solid #d4edda', padding: 10, marginBottom: 12, borderRadius: 6 }}>
      <strong>Community rules:</strong>
      <div style={{ marginTop: 6 }}>{rules.text}</div>
    </div>
  )
}
