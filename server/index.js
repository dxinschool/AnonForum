const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');
const db = require('./db');
const http = require('http')

// initialize DB safely and log helpful debug if structure is unexpected
if (db && typeof db.init === 'function') {
  db.init().catch(err => {
    console.error('Failed to initialize DB:', err)
    process.exit(1)
  })
} else {
  console.error('DB module does not expose init():', db)
  throw new Error('DB module missing init()')
}

const app = express();
app.use(cors());
app.use(express.json());

// create http server and socket.io
const httpServer = http.createServer(app)
console.log('DEBUG: created httpServer, typeof httpServer =', typeof httpServer, 'constructor=', httpServer && httpServer.constructor && httpServer.constructor.name)
// WebSocket server (using 'ws')
const WebSocket = require('ws')
const rateLimit = require('express-rate-limit')
const sharp = require('sharp')
const fs = require('fs')
const fsp = fs.promises
const wss = new WebSocket.Server({ noServer: true })

// serve uploaded files
const path = require('path')
const multer = require('multer')
const uploadsDir = path.join(__dirname, 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })
app.use('/uploads', express.static(uploadsDir))

// multer setup: disk storage with nanoid filenames and limits
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir) },
  filename: function (req, file, cb) {
    const ext = (file.originalname || '').split('.').pop()
    cb(null, nanoid() + (ext ? ('.' + ext) : ''))
  }
})
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  const ok = /image\/(png|jpe?g|gif|webp)/i.test(file.mimetype)
  cb(ok ? null : new Error('Invalid file type'), ok)
} })

// simple websocket per-socket rate limiting: allow N messages per WINDOW
const WS_WINDOW_MS = 10 * 1000 // 10s
const WS_MAX_MSGS = 8

wss.on('connection', async (ws, request) => {
  console.log('ws client connected')
  // attach simple message timestamps buffer
  ws._msgTimestamps = []
  // send history
  const history = await db.getChatMessages(200)
  ws.send(JSON.stringify({ type: 'history', data: history }))

  ws.on('message', async (msg) => {
    try {
      // simple rate limiting per websocket connection
      const now = Date.now()
      ws._msgTimestamps = (ws._msgTimestamps || []).filter(t => (now - t) < WS_WINDOW_MS)
      if (ws._msgTimestamps.length >= WS_MAX_MSGS) {
        // ignore extra messages
        console.warn('ws message rate limit exceeded, ignoring')
        return
      }
      ws._msgTimestamps.push(now)

      const data = JSON.parse(msg.toString())
      if (data && data.type === 'message') {
        const payload = data.payload || {}
        const chatMsg = {
          id: nanoid(),
          author: payload.author || 'anon',
          text: (payload.text || '').toString(),
          created_at: Math.floor(Date.now() / 1000)
        }
        await db.addChatMessage(chatMsg)
        // broadcast chat message to all clients
        const out = JSON.stringify({ type: 'message', data: chatMsg })
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) client.send(out)
        })
      }
    } catch (err) {
      console.warn('failed to handle ws message', err)
    }
  })

  ws.on('close', () => console.log('ws client disconnected'))
})

// helper
const now = () => Math.floor(Date.now() / 1000);

// List threads
app.get('/api/threads', async (req, res) => {
  try {
    const q = (req.query.q || req.query.search || '').toString().trim()
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1)
    const perPage = Math.max(1, Math.min(100, parseInt(req.query.per_page || req.query.perPage || '5', 10) || 5))
    let result
    if (q) result = await db.searchThreads(q, page, perPage)
    else result = await db.getThreads(page, perPage)
    const total = result && result.total ? result.total : 0
    res.json({ items: result.items || [], total, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(total / perPage)) })
  } catch (err) {
    console.warn('list threads failed', err)
    res.status(500).json({ items: [], total: 0, page: 1, per_page: 5, total_pages: 1 })
  }
});

// chat history endpoint
app.get('/api/chat', async (req, res) => {
  const msgs = await db.getChatMessages(200)
  res.json(msgs)
})

// Create thread
// rate limiter for write endpoints
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false })

app.post('/api/threads', writeLimiter, upload.single('image'), async (req, res) => {
  // multer will populate req.file (if image uploaded) and req.body
  const { title, body } = req.body || {};
  // validation: title/body length limits
  const TITLE_MAX = 200
  const BODY_MAX = 2000
  if (!title || title.trim().length === 0) {
    return res.status(400).json({ error: 'title required' });
  }
  if (title.length > TITLE_MAX) return res.status(400).json({ error: `title too long (max ${TITLE_MAX})` })
  if (body && body.length > BODY_MAX) return res.status(400).json({ error: `body too long (max ${BODY_MAX})` })
  const id = nanoid();
  const created_at = now();
  const thread = { id, title, body: body || '', created_at, score: 0, upvotes: 0, downvotes: 0 }
  if (req.file && req.file.filename) {
    // store a public path to the uploaded image and create a thumbnail
    const fname = req.file.filename
    const filePath = path.join(uploadsDir, fname)
    const thumbName = 'thumb-' + fname
    const thumbPath = path.join(uploadsDir, thumbName)
    try {
      // create a resized main image (max width 1200) and a small thumb (320)
      await sharp(filePath).resize({ width: 1200, withoutEnlargement: true }).toFile(filePath + '.resized')
      await fsp.rename(filePath + '.resized', filePath)
      await sharp(filePath).resize({ width: 320 }).toFile(thumbPath)
      thread.image = `/uploads/${fname}`
      thread.thumb = `/uploads/${thumbName}`
    } catch (err) {
      console.warn('image processing failed', err)
      thread.image = `/uploads/${fname}`
    }
  }
  // parse tags if provided (JSON array or comma-separated string)
  try {
    const rawTags = req.body && req.body.tags
    if (rawTags) {
      let arr = []
      if (typeof rawTags === 'string') {
        try { arr = JSON.parse(rawTags) } catch (e) { arr = rawTags.split(',').map(x => x.trim()).filter(Boolean) }
      } else if (Array.isArray(rawTags)) arr = rawTags
      thread.tags = (arr || []).slice(0, 10).map(t => String(t).trim()).filter(Boolean)
    }
  } catch (e) { /* ignore */ }
  await db.createThread(thread)
  res.status(201).json(thread);
  // broadcast new thread to websocket clients so thread list updates instantly
  try {
    const out = JSON.stringify({ type: 'thread', data: thread })
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(out)
    })
  } catch (err) {
    console.warn('failed to broadcast new thread', err)
  }
});

// Admin login - simple token creation. Use ADMIN_PASSWORD env var or default 'adminpass'
app.post('/api/admin/login', async (req, res) => {
  const pwd = req.body && req.body.password
  const expected = process.env.ADMIN_PASSWORD || 'adminpass'
  if (!pwd || pwd !== expected) return res.status(401).json({ error: 'invalid' })
  const token = nanoid()
  try {
    await db.addAdminToken(token)
    res.json({ token })
  } catch (err) {
    console.warn('admin login failed', err)
    res.status(500).json({ error: 'server' })
  }
})

// Get current announcement
app.get('/api/announcement', async (req, res) => {
  try {
    const a = await db.getAnnouncement()
    res.json(a || null)
  } catch (err) { console.warn('get announcement failed', err); res.status(500).json(null) }
})

// Admin: set announcement (or clear if body.text empty)
app.post('/api/admin/announce', async (req, res) => {
  const auth = (req.headers && req.headers.authorization) || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  try {
    const ok = await db.hasAdminToken(token)
    if (!ok) return res.status(403).json({ error: 'forbidden' })
    const text = req.body && req.body.text
    const announcement = await db.setAnnouncement(text)
    // broadcast announcement
    try {
      const out = JSON.stringify({ type: 'announcement', data: announcement })
      wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(out) })
    } catch (e) { console.warn('broadcast announcement failed', e) }
    res.json(announcement || null)
  } catch (err) { console.warn('announce failed', err); res.status(500).json({ error: 'server' }) }
})

// Rules endpoints
app.get('/api/rules', async (req, res) => {
  try {
    const r = await db.getRules()
    res.json(r || null)
  } catch (err) { console.warn('get rules failed', err); res.status(500).json(null) }
})

app.post('/api/admin/rules', async (req, res) => {
  const auth = (req.headers && req.headers.authorization) || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  try {
    const ok = await db.hasAdminToken(token)
    if (!ok) return res.status(403).json({ error: 'forbidden' })
    const text = req.body && req.body.text
    const rules = await db.setRules(text)
    // broadcast rules update
    try {
      const out = JSON.stringify({ type: 'rules', data: rules })
      wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(out) })
    } catch (e) { console.warn('broadcast rules failed', e) }
    res.json(rules || null)
  } catch (err) { console.warn('set rules failed', err); res.status(500).json({ error: 'server' }) }
})

// Reporting endpoints
app.post('/api/report', async (req, res) => {
  try {
    const { target_type, target_id, reason } = req.body || {}
    if (!target_type || !target_id) return res.status(400).json({ error: 'target required' })
    const rep = await db.createReport({ target_type, target_id, reason })
    res.status(201).json(rep)
    // broadcast report to websocket clients (admins will receive it)
    try {
      const out = JSON.stringify({ type: 'report', data: rep })
      wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(out) })
    } catch (e) { console.warn('broadcast report failed', e) }
  } catch (err) { console.warn('create report failed', err); res.status(500).json({ error: 'server' }) }
})

app.get('/api/admin/reports', async (req, res) => {
  const auth = (req.headers && req.headers.authorization) || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  try {
    const ok = await db.hasAdminToken(token)
    if (!ok) return res.status(403).json({ error: 'forbidden' })
    const rows = await db.listReports()
    res.json(rows)
  } catch (err) { console.warn('list reports failed', err); res.status(500).json({ error: 'server' }) }
})

app.post('/api/admin/reports/:id/resolve', async (req, res) => {
  const auth = (req.headers && req.headers.authorization) || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  try {
    const ok = await db.hasAdminToken(token)
    if (!ok) return res.status(403).json({ error: 'forbidden' })
    const id = req.params.id
    const r = await db.resolveReport(id)
    res.json(r || null)
    // broadcast report resolved to websocket clients
    try {
      const out = JSON.stringify({ type: 'report_resolved', data: r })
      wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(out) })
    } catch (e) { console.warn('broadcast report_resolved failed', e) }
  } catch (err) { console.warn('resolve report failed', err); res.status(500).json({ error: 'server' }) }
})

// Delete thread (admin only)
app.delete('/api/threads/:id', async (req, res) => {
  const auth = (req.headers && req.headers.authorization) || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  try {
    const ok = await db.hasAdminToken(token)
    if (!ok) return res.status(403).json({ error: 'forbidden' })
    const id = req.params.id
    await db.deleteThreadById(id)
    // broadcast deletion to websocket clients
    try {
      const out = JSON.stringify({ type: 'delete_thread', data: { id } })
      wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(out) })
    } catch (e) { console.warn('broadcast delete failed', e) }
    res.json({ ok: true })
  } catch (err) {
    console.warn('delete thread failed', err)
    res.status(500).json({ error: 'server' })
  }
})

// Get single thread with comments
app.get('/api/threads/:id', async (req, res) => {
  const id = req.params.id;
  const result = await db.getThreadWithComments(id)
  if (!result) return res.status(404).json({ error: 'not found' })
  res.json(result)
});

// Post comment
app.post('/api/threads/:id/comments', async (req, res) => {
  const id = req.params.id;
  const { parent_id, body } = req.body || {};
  const COMMENT_MAX = 1000
  if (!body || body.trim().length === 0) return res.status(400).json({ error: 'body required' });
  if (body.length > COMMENT_MAX) return res.status(400).json({ error: `comment too long (max ${COMMENT_MAX})` });
  const thread = await db.getThreadWithComments(id)
  if (!thread) return res.status(404).json({ error: 'thread not found' });
  const cid = nanoid();
  const created_at = now();
  const comment = { id: cid, thread_id: id, parent_id: parent_id || null, body, created_at, score: 0 }
  await db.createComment(comment)
  res.status(201).json(comment)
  // broadcast new comment to websocket clients so thread views update instantly
  try {
    const out = JSON.stringify({ type: 'comment', data: comment })
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(out)
    })
  } catch (err) { console.warn('failed to broadcast comment', err) }
});

// Vote (thread or comment)
app.post('/api/vote', async (req, res) => {
  const { target_type, target_id, vote } = req.body || {};
  if (!['thread', 'comment'].includes(target_type)) return res.status(400).json({ error: 'invalid target_type' });
  if (!target_id) return res.status(400).json({ error: 'target_id required' });
  if (![1, -1].includes(vote)) return res.status(400).json({ error: 'vote must be 1 or -1' });
  const id = nanoid();
  const created_at = now();
  const voter_id = req.body && req.body.voter_id
  const v = { id, target_type, target_id, vote, created_at, voter_id }
  const updated = await db.addVote(v)
  // broadcast vote update to websocket clients
  try {
    const out = JSON.stringify({ type: 'vote', data: { target_type, target_id, updated } })
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(out)
    })
  } catch (err) { console.warn('failed to broadcast vote', err) }
  res.json({ target: updated })
});

const PORT = process.env.PORT || 4000;
httpServer.on('upgrade', (request, socket, head) => {
  // handle websocket upgrade for /ws path
  try {
    const reqUrl = request.url || ''
    // parse path safely (may include querystring)
    const pathname = (new URL(reqUrl, 'http://localhost')).pathname
    if (pathname === '/ws' || pathname === '/socket' || pathname.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request)
      })
    } else {
      socket.destroy()
    }
  } catch (err) {
    console.warn('upgrade handler error', err)
    try { socket.destroy() } catch (e) {}
  }
})

httpServer.listen(PORT, () => {
  console.log(`Forum server listening on ${PORT}`);
});

// Chat pruning: remove messages older than 5 minutes every 60 seconds
const CHAT_TTL_SECONDS = 60 * 5 // 5 minutes
setInterval(async () => {
  try {
    const { changed, chat } = await db.pruneChat(CHAT_TTL_SECONDS)
    if (changed) {
      // broadcast updated history
      const out = JSON.stringify({ type: 'history', data: chat })
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(out)
      })
    }
  } catch (err) {
    console.warn('chat prune failed', err)
  }
}, 60 * 1000)
