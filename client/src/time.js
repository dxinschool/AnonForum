export function timeAgo(epochSeconds) {
  if (!epochSeconds) return ''
  const s = Math.floor(Date.now()/1000) - epochSeconds
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s`
  const m = Math.floor(s/60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m/60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h/24)
  return `${d}d`
}

export default timeAgo
