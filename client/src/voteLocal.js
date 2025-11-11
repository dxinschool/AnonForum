// Simple local vote store using localStorage
const KEY = 'votes'

function readAll() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) { return {} }
}

export function getVote(id) {
  const all = readAll()
  return all[id] ?? null
}

export function setVote(id, val) {
  const all = readAll()
  if (val === null || typeof val === 'undefined') delete all[id]
  else all[id] = val
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch (e) { /* ignore */ }
}

export default { getVote, setVote }
