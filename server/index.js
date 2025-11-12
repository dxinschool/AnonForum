const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');
const db = require('./db');
const http = require('http')
const escapeHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const escapeJs = (s) => String(s || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\"/g,'\\\"')

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
// rate limiter to use on write endpoints (defined early so endpoints can reference it)
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false })
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
          image: payload.image || null,
          created_at: Math.floor(Date.now() / 1000)
        }
        // enforce server-side blocklist for websocket messages
        try {
          const blocked = await db.isBlocked(chatMsg.text)
          if (blocked) {
            try { ws.send(JSON.stringify({ type: 'error', error: 'Message include blocked messages.' })) } catch (e) {}
            return
          }
        } catch (e) {
          // if isBlocked fails, log and proceed to attempt add
          console.warn('blocklist check failed', e)
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

// chat image upload for messages (multipart/form-data with field 'image')
app.post('/api/chat/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file || !req.file.filename) return res.status(400).json({ error: 'no file' })
    const fname = req.file.filename
    const filePath = path.join(uploadsDir, fname)
    try {
      // resize to reasonable width (max 1000)
      await sharp(filePath).resize({ width: 1000, withoutEnlargement: true }).toFile(filePath + '.resized')
      await fsp.rename(filePath + '.resized', filePath)
    } catch (err) {
      console.warn('chat image processing failed, continuing with original', err)
    }
    const url = `/uploads/${fname}`
    // Optionally create a chat message when additional form fields are provided
    // If the multipart form also included `text` or `author`, create a chat message
    const maybeText = (req.body && req.body.text) ? String(req.body.text) : null
    const maybeAuthor = (req.body && req.body.author) ? String(req.body.author) : 'anon'
    if (maybeText) {
      try {
        const chatMsg = {
          id: nanoid(),
          author: maybeAuthor || 'anon',
          text: maybeText,
          image: url,
          created_at: Math.floor(Date.now() / 1000)
        }
        await db.addChatMessage(chatMsg)
        // broadcast chat message to all websocket clients
        const out = JSON.stringify({ type: 'message', data: chatMsg })
        wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(out) })
        // respond with both url and created message
        return res.status(201).json({ url, message: chatMsg })
      } catch (err) {
        console.warn('failed to create chat message for uploaded image', err)
        if (err && err.message === 'blocked_content') return res.status(400).json({ error: 'blocked' })
        // fall through to return url only
      }
    }

    res.status(201).json({ url })
  } catch (err) {
    console.warn('chat upload failed', err)
    res.status(500).json({ error: 'server' })
  }
})

// Create chat message via REST (for clients that prefer HTTP over websockets)
app.post('/api/chat', writeLimiter, async (req, res) => {
  try {
    const { author, text, image } = req.body || {}
    if (!text || String(text).trim().length === 0) return res.status(400).json({ error: 'text required' })
    const chatMsg = {
      id: nanoid(),
      author: author || 'anon',
      text: String(text),
      image: image || null,
      created_at: Math.floor(Date.now() / 1000)
    }
    try {
      await db.addChatMessage(chatMsg)
    } catch (err) {
      if (err && err.message === 'blocked_content') return res.status(400).json({ error: 'blocked' })
      throw err
    }
    // broadcast chat message to all websocket clients
    try {
      const out = JSON.stringify({ type: 'message', data: chatMsg })
      wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(out) })
    } catch (e) { console.warn('broadcast chat message failed', e) }
    res.status(201).json(chatMsg)
  } catch (err) {
    console.warn('create chat message failed', err)
    res.status(500).json({ error: 'server' })
  }
})

// Admin pin/unpin chat message
app.post('/api/admin/chat/:id/pin', async (req, res) => {
  const auth = (req.headers && req.headers.authorization) || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  try {
    const ok = await db.hasAdminToken(token)
    if (!ok) return res.status(403).json({ error: 'forbidden' })
    const id = req.params.id
    const pinned = req.body && req.body.pinned === true
    const updated = await db.setChatPinned(id, pinned)
    try { await db.addAuditEntry('chat_pin', { id, pinned }, token) } catch (e) { console.warn('audit add failed', e) }
    // broadcast pin change
    try {
      const out = JSON.stringify({ type: 'chat_pin', data: { id, pinned } })
      wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(out) })
    } catch (e) { console.warn('broadcast chat_pin failed', e) }
    res.json(updated)
  } catch (err) { console.warn('pin chat failed', err); res.status(500).json({ error: 'server' }) }
})

// Create thread
// rate limiter for write endpoints (defined above)

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
  // enforce server-side blocklist for title/body
  try {
    if (await db.isBlocked(title || '')) return res.status(400).json({ error: 'blocked' })
    if (body && await db.isBlocked(body)) return res.status(400).json({ error: 'blocked' })
  } catch (e) {
    console.warn('blocklist check failed for thread create', e)
  }
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
    try { await db.addAuditEntry('admin_login', { }, token) } catch (e) { console.warn('audit add failed', e) }
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
  try { await db.addAuditEntry('set_announcement', { text: text || null }, token) } catch (e) { console.warn('audit add failed', e) }
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
  try { await db.addAuditEntry('set_rules', { text: text || null }, token) } catch (e) { console.warn('audit add failed', e) }
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
    const result = await db.resolveReport(id)
    if (!result || !result.resolved) return res.status(404).json({ error: 'not found' })
    // audit
    try { await db.addAuditEntry('resolve_report', { id, removed: result.removed || [] }, token) } catch (e) { console.warn('audit add failed', e) }
    res.json(result.resolved)
    // broadcast report resolved and any removed duplicate reports to websocket clients
    try {
      const out = JSON.stringify({ type: 'report_resolved', data: result.resolved })
      wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(out) })
      // broadcast deleted duplicates
      if (Array.isArray(result.removed)) {
        for (const rid of result.removed) {
          const od = JSON.stringify({ type: 'report_deleted', data: { id: rid } })
          wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(od) })
        }
      }
    } catch (e) { console.warn('broadcast report_resolved failed', e) }
  } catch (err) { console.warn('resolve report failed', err); res.status(500).json({ error: 'server' }) }
})

app.delete('/api/admin/reports/:id', async (req, res) => {
  const auth = (req.headers && req.headers.authorization) || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  try {
    const ok = await db.hasAdminToken(token)
    if (!ok) return res.status(403).json({ error: 'forbidden' })
    const id = req.params.id
    const r = await db.deleteReport(id)
    if (!r || !r.ok) return res.status(404).json({ error: 'not found' })
    try { await db.addAuditEntry('delete_report', { id }, token) } catch (e) { console.warn('audit add failed', e) }
    // broadcast report deletion to websocket clients
    try {
      const out = JSON.stringify({ type: 'report_deleted', data: { id } })
      wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(out) })
    } catch (e) { console.warn('broadcast report_deleted failed', e) }
    res.status(200).json({ ok: true })
  } catch (err) { console.warn('delete report failed', err); res.status(500).json({ error: 'server' }) }
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
  try { await db.addAuditEntry('delete_thread', { id }, token) } catch (e) { console.warn('audit add failed', e) }
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

// Public share page for social embeds (Open Graph / Twitter cards).
// This returns a minimal HTML page with meta tags for previews and a JS redirect
// back to the SPA using ?thread=<id> so the client automatically opens the thread.
app.get('/t/:id', async (req, res) => {
  try {
    const id = req.params.id
    const result = await db.getThreadWithComments(id)
    if (!result || !result.thread) return res.status(404).send('Not found')
    const t = result.thread
  // prefer forwarded host/proto headers when behind a proxy/tunnel so OG URLs
  // use the public tunnel hostname rather than localhost:4000
  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim()
  const protocol = forwardedProto || req.protocol
  const forwardedHost = (req.get('x-forwarded-host') || req.get('x-original-host') || req.get('host') || '').split(',')[0].trim()
  const host = forwardedHost || req.get('host')
  const absUrl = `${protocol}://${host}${req.baseUrl || ''}`
  const pageUrl = `${protocol}://${host}${req.originalUrl}`
  // prefer thumbnail when available (smaller and ideal for previews), fall back to main image or default
  const defaultImage = process.env.DEFAULT_OG_IMAGE || ''
  const imagePath = t.thumb || t.image || defaultImage
  const image = imagePath ? (imagePath.startsWith('http') ? imagePath : `${protocol}://${host}${imagePath}`) : ''
    const description = (t.body || '').replace(/<[^>]+>/g, '').slice(0, 200)
    const title = (t.title || '').slice(0, 200)
    const created = new Date((t.created_at || Math.floor(Date.now()/1000)) * 1000).toISOString()
    const siteName = process.env.SITE_NAME || host
  // prefer linking to /t/:id?thread=:id so frontends can use the /t/:id path while
  // still passing the thread id in the querystring for SPA initialization
  const pageLink = `${absUrl}/t/${encodeURIComponent(id)}?thread=${encodeURIComponent(id)}`
  const oembedUrl = `${absUrl}/oembed/${encodeURIComponent(id)}.json`
    // detect crawler UAs — these should receive the static page (no redirect)
    const ua = (req.get('user-agent') || '')
    const crawlerRe = /facebookexternalhit|facebot|twitterbot|discordbot|slackbot|telegrambot|whatsapp|linkedinbot|pinterest|googlebot|bingbot|oembed/i
    const isCrawler = crawlerRe.test(ua)

    // Base head / meta (common for both crawler and human)
    const head = `  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width,initial-scale=1" />\n  <title>${escapeHtml(title)}</title>\n  <link type="application/json+oembed" href="${escapeHtml(oembedUrl)}" />\n  <meta property="og:site_name" content="${escapeHtml(siteName)}" />\n  <meta property="og:type" content="article" />\n  <meta property="og:title" content="${escapeHtml(title)}" />\n  <meta property="og:description" content="${escapeHtml(description)}" />\n  <meta property="og:url" content="${escapeHtml(pageUrl)}" />\n  ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}\n  <meta name="twitter:card" content="summary_large_image" />\n  <meta name="twitter:title" content="${escapeHtml(title)}" />\n  <meta name="twitter:description" content="${escapeHtml(description)}" />\n  ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : ''}\n  <meta name="article:published_time" content="${created}" />\n  <link rel="canonical" href="${escapeHtml(pageUrl)}" />`

    // For human visitors, add a small redirect so clicking the share link opens the SPA thread directly.
    let redirectPart = ''
    if (!isCrawler) {
      // fast client redirect; direct humans to the SPA path /t/:id?thread=<id>
      redirectPart = `\n  <meta http-equiv="refresh" content="0;url=${escapeHtml(absUrl)}/t/${encodeURIComponent(id)}?thread=${encodeURIComponent(id)}" />\n  <script>window.location.replace('${escapeJs(absUrl)}/t/${encodeURIComponent(id)}?thread=${encodeURIComponent(id)}')</script>`
    }

    const html = `<!doctype html>\n<html>\n<head>\n${head}${redirectPart}\n</head>\n<body>\n  <main style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 24px; max-width: 720px; margin: 40px auto;">\n    <h1 style="font-size:20px;margin-bottom:8px">${escapeHtml(title)}</h1>\n    <p style="color:#444">${escapeHtml(description)}</p>\n    ${image ? `<p><img src="${escapeHtml(image)}" alt="thumbnail" style="max-width:100%;height:auto;border-radius:8px;margin-top:12px"/></p>` : ''}\n    <p style="margin-top:18px"><a href="${escapeHtml(pageLink)}">Open thread in the app</a></p>\n  </main>\n</body>\n</html>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (err) {
    console.warn('share page render failed', err)
    res.status(500).send('server error')
  }
})

// Post comment
app.post('/api/threads/:id/comments', async (req, res) => {
  const id = req.params.id;
  const { parent_id, body } = req.body || {};
  const COMMENT_MAX = 1000
  if (!body || body.trim().length === 0) return res.status(400).json({ error: 'body required' });
  if (body.length > COMMENT_MAX) return res.status(400).json({ error: `comment too long (max ${COMMENT_MAX})` });
  // enforce blocklist for comments
  try {
    if (await db.isBlocked(body)) return res.status(400).json({ error: 'blocked' })
  } catch (e) {
    console.warn('blocklist check failed for comment create', e)
  }
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

// Reactions: read or add reactions for a target
app.get('/api/reactions', async (req, res) => {
  try {
    const target_type = req.query.target_type
    const target_id = req.query.target_id
    if (!target_type || !target_id) return res.status(400).json({ error: 'target required' })
    const out = await db.getReactionsForTarget(target_type, target_id)
    res.json(out)
  } catch (err) { console.warn('get reactions failed', err); res.status(500).json({ error: 'server' }) }
})

app.post('/api/reactions', writeLimiter, async (req, res) => {
  try {
    const { target_type, target_id, emoji, voter_id } = req.body || {}
    if (!target_type || !target_id || !emoji) return res.status(400).json({ error: 'missing' })
    const out = await db.addReaction({ target_type, target_id, emoji, voter_id })
    // broadcast updated reaction aggregation
    try { const ev = JSON.stringify({ type: 'reaction', data: { target_type, target_id, reactions: out } }); wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(ev) }) } catch (e) { console.warn('broadcast reaction failed', e) }
    res.json(out)
  } catch (err) { console.warn('add reaction failed', err); res.status(500).json({ error: 'server' }) }
})

// Polls: create, get, vote
app.post('/api/polls', writeLimiter, async (req, res) => {
  try {
    const { thread_id, question, options, ends_at } = req.body || {}
    if (!thread_id || !question || !Array.isArray(options) || options.length < 2) return res.status(400).json({ error: 'invalid' })
    const p = await db.createPoll({ thread_id, question, options, ends_at })
    try { const ev = JSON.stringify({ type: 'poll_created', data: p }); wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(ev) }) } catch (e) { console.warn('broadcast poll created failed', e) }
    res.status(201).json(p)
  } catch (err) { console.warn('create poll failed', err); res.status(500).json({ error: 'server' }) }
})

app.get('/api/polls/:id', async (req, res) => {
  try {
    const p = await db.getPoll(req.params.id)
    if (!p) return res.status(404).json({ error: 'not found' })
    res.json(p)
  } catch (err) { console.warn('get poll failed', err); res.status(500).json({ error: 'server' }) }
})

// list polls for a thread
app.get('/api/threads/:id/polls', async (req, res) => {
  try {
    const id = req.params.id
    const rows = await db.getPollsForThread(id)
    res.json(rows || [])
  } catch (err) { console.warn('get polls for thread failed', err); res.status(500).json({ error: 'server' }) }
})

app.post('/api/polls/:id/vote', writeLimiter, async (req, res) => {
  try {
    const pollId = req.params.id
    const { option_id, voter_id } = req.body || {}
    if (!option_id) return res.status(400).json({ error: 'option required' })
    const p = await db.votePoll(pollId, option_id, voter_id)
    if (!p) return res.status(404).json({ error: 'not found' })
    try { const ev = JSON.stringify({ type: 'poll_vote', data: p }); wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(ev) }) } catch (e) { console.warn('broadcast poll vote failed', e) }
    res.json(p)
  } catch (err) { console.warn('vote poll failed', err); res.status(500).json({ error: 'server' }) }
})

// Admin: blocklist management
app.get('/api/admin/blocklist', async (req, res) => {
  const auth = (req.headers && req.headers.authorization) || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  try {
    const ok = await db.hasAdminToken(token)
    if (!ok) return res.status(403).json({ error: 'forbidden' })
    const list = await db.getBlocklist()
    res.json(list)
  } catch (err) { console.warn('get blocklist failed', err); res.status(500).json({ error: 'server' }) }
})

app.post('/api/admin/blocklist', async (req, res) => {
  const auth = (req.headers && req.headers.authorization) || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  try {
    const ok = await db.hasAdminToken(token)
    if (!ok) return res.status(403).json({ error: 'forbidden' })
    const list = req.body && req.body.list ? req.body.list : []
    const saved = await db.setBlocklist(list)
    try { await db.addAuditEntry('set_blocklist', { list: saved }, token) } catch (e) { console.warn('audit add failed', e) }
    res.json(saved)
  } catch (err) { console.warn('set blocklist failed', err); res.status(500).json({ error: 'server' }) }
})

// Admin: audit log
app.get('/api/admin/audit', async (req, res) => {
  const auth = (req.headers && req.headers.authorization) || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  try {
    const ok = await db.hasAdminToken(token)
    if (!ok) return res.status(403).json({ error: 'forbidden' })
    const rows = await db.listAudit()
    res.json(rows)
  } catch (err) { console.warn('list audit failed', err); res.status(500).json({ error: 'server' }) }
})

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

// oEmbed endpoint for richer embeds (Discord supports oEmbed in addition to OG)
app.get('/oembed/:id.json', async (req, res) => {
  try {
    const id = req.params.id
    const result = await db.getThreadWithComments(id)
    if (!result || !result.thread) return res.status(404).json({ error: 'not found' })
    const t = result.thread
    // prefer forwarded host/proto headers when behind a proxy/tunnel
    const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim()
    const protocol = forwardedProto || req.protocol
    const forwardedHost = (req.get('x-forwarded-host') || req.get('x-original-host') || req.get('host') || '').split(',')[0].trim()
    const host = forwardedHost || req.get('host')
    const absUrl = `${protocol}://${host}${req.baseUrl || ''}`
    const pageUrl = `${protocol}://${host}${req.originalUrl}`
    const pageLink = `${protocol}://${host}/t/${encodeURIComponent(id)}`
    const defaultImage = process.env.DEFAULT_OG_IMAGE || ''
    const imagePath = t.thumb || t.image || defaultImage
    const image = imagePath ? (imagePath.startsWith('http') ? imagePath : `${protocol}://${host}${imagePath}`) : ''

    const oembed = {
      version: '1.0',
      type: 'link',
      provider_name: process.env.SITE_NAME || host,
      provider_url: `${protocol}://${host}`,
      title: t.title || '',
      author_name: process.env.SITE_NAME || host,
      url: pageLink,
      thumbnail_url: image || undefined
    }
    // respond as oEmbed type and add a short cache hint
    res.setHeader('Content-Type', 'application/json+oembed; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.json(oembed)
  } catch (err) {
    console.warn('oembed render failed', err)
    res.status(500).json({ error: 'server error' })
  }
})
