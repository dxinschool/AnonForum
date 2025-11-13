// simple shared websocket helper: subscribe(callback) -> unsubscribe, and send(obj)
let socket = null
const subscribers = new Set()
let reconnectTimer = null
let reconnectDelay = 1000
let outgoingQueue = []

function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return socket
  const loc = window.location
  const protocol = loc.protocol === 'https:' ? 'wss' : 'ws'
  // Allow overriding websocket URL at build time via Vite env VITE_WS_URL.
  // If not set, fall back to same-origin `/ws`.
  const configured = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL) ? String(import.meta.env.VITE_WS_URL) : ''
  const wsUrl = configured || `${protocol}://${loc.host}/ws`
  socket = new WebSocket(wsUrl)
  socket.addEventListener('open', () => {
    console.log('shared ws open')
    // flush any queued outgoing messages
    try {
      while (outgoingQueue.length && socket && socket.readyState === WebSocket.OPEN) {
        const item = outgoingQueue.shift()
        try { socket.send(item) } catch (e) { console.warn('failed sending queued ws item', e); break }
      }
    } catch (e) { console.warn('flush queue failed', e) }
    // reset reconnect delay on successful open
    reconnectDelay = 1000
  })
  socket.addEventListener('error', (e) => {
    console.warn('shared ws error', e)
  })
  socket.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data)
      subscribers.forEach(fn => {
        try { fn(msg) } catch (e) { console.warn('ws subscriber error', e) }
      })
    } catch (err) {
      console.warn('failed parse ws message', err)
    }
  })
  socket.addEventListener('close', () => console.log('shared ws closed'))
  socket.addEventListener('close', () => {
    // schedule reconnect
    socket = null
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => { reconnectTimer = null; reconnectDelay = Math.min(30000, reconnectDelay * 1.5); ensureSocket() }, reconnectDelay)
  })
  return socket
}

export function subscribe(fn) {
  subscribers.add(fn)
  ensureSocket()
  return () => { subscribers.delete(fn) }
}

export function send(obj) {
  const s = JSON.stringify(obj)
  ensureSocket()
  try {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(s)
    } else {
      // queue until open
      outgoingQueue.push(s)
      // cap queue to avoid memory blowup
      if (outgoingQueue.length > 200) outgoingQueue.splice(0, outgoingQueue.length - 200)
    }
  } catch (err) {
    console.warn('ws send failed', err)
  }
}

export function getRawSocket() { ensureSocket(); return socket }
