// simple shared websocket helper: subscribe(callback) -> unsubscribe, and send(obj)
let socket = null
const subscribers = new Set()
let reconnectTimer = null
let reconnectDelay = 1000

function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return socket
  const loc = window.location
  const protocol = loc.protocol === 'https:' ? 'wss' : 'ws'
  socket = new WebSocket(`${protocol}://${loc.host}/ws`)
  socket.addEventListener('open', () => console.log('shared ws open'))
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
  ensureSocket()
  try {
    socket.send(JSON.stringify(obj))
  } catch (err) {
    console.warn('ws send failed', err)
  }
}

export function getRawSocket() { ensureSocket(); return socket }
