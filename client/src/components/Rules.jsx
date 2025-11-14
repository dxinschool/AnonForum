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
    <div className="notice rules">
      <strong>Community rules:</strong>
      <div className="notice-body">{rules.text}</div>
    </div>
  )
}
