console.log('DEBUG: loading lowdb...')
const lowdbModule = require('lowdb')
const lowdbNode = require('lowdb/node')
console.log('DEBUG: lowdbModule keys=', Object.keys(lowdbModule || {}))
console.log('DEBUG: lowdbNode keys=', Object.keys(lowdbNode || {}))
const { Low } = lowdbModule
const { JSONFile } = lowdbNode
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const { nanoid } = require('nanoid')

const file = path.join(__dirname, 'db.json')
const adapter = new JSONFile(file)

// Provide default data as the second argument to Low to avoid the "missing default data" error
const defaultData = { threads: [], comments: [], votes: [], chat: [], admin_tokens: [], announcement: { text: 'Welcome! This is an anonymous forum. Be kind and follow the rules.' }, rules: { text: 'Be respectful. No doxxing. Report abuse.' }, reports: [], reactions: [], polls: [], blocklist: [], audit: [] }
const db = new Low(adapter, defaultData)

function nowSec() { return Math.floor(Date.now() / 1000) }

async function safeWrite() {
  try {
    await db.write()
  } catch (err) {
    // On Windows/OneDrive the atomic temp-rename can fail with EPERM/EACCES/EBUSY.
    // Fallback to a direct write to the destination file as a best-effort recovery.
    if (err && (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY')) {
      try {
        console.warn('safeWrite: primary db.write() failed, attempting fallback write to', file, err && err.code)
        await fsp.writeFile(file, JSON.stringify(db.data || defaultData, null, 2), 'utf8')
        return
      } catch (err2) {
        console.error('safeWrite fallback also failed', err2)
        throw err2
      }
    }
    throw err
  }
}

async function init() {
  await db.read()
  db.data = db.data || {}
  // ensure all expected keys exist, but preserve existing data
  db.data.threads = db.data.threads || defaultData.threads
  db.data.comments = db.data.comments || defaultData.comments
  db.data.votes = db.data.votes || defaultData.votes
  db.data.chat = db.data.chat || defaultData.chat
  db.data.admin_tokens = db.data.admin_tokens || defaultData.admin_tokens
  db.data.announcement = db.data.announcement === undefined ? defaultData.announcement : db.data.announcement
  db.data.rules = db.data.rules === undefined ? defaultData.rules : db.data.rules
  db.data.reports = db.data.reports || defaultData.reports
  await safeWrite()
}

async function getThreads(page = 1, perPage = 100) {
  await db.read()
  const all = (db.data.threads || []).slice().sort((a, b) => b.created_at - a.created_at)
  const total = all.length
  const start = Math.max(0, (page - 1) * perPage)
  const slice = all.slice(start, start + perPage)
  // attach comment counts and a top comment preview (top by score, then earliest)
  const comments = (db.data.comments || [])
  const byThread = {}
  for (const c of comments) {
    byThread[c.thread_id] = byThread[c.thread_id] || []
    byThread[c.thread_id].push(c)
  }
  const mapped = slice.map(t => {
    const cs = byThread[t.id] || []
    let top = null
    if (cs.length > 0) {
      top = cs.slice().sort((a, b) => {
        const sa = (a.score || 0), sb = (b.score || 0)
        if (sb !== sa) return sb - sa
        return a.created_at - b.created_at
      })[0]
    }
    return { ...t, comment_count: cs.length, top_comment: top }
  })
  return { items: mapped, total }
}

async function searchThreads(query, page = 1, perPage = 100) {
  await db.read()
  const qRaw = (query || '').toString().trim()
  const q = qRaw.toLowerCase()
  if (!qRaw) return await getThreads(page, perPage)
  const all = (db.data.threads || []).slice().filter(t => {
    // match by id (allow queries like 'ws-<id>' or the raw id)
    const id = (t.id || '').toString()
    const idNormalized = id
    const qStripped = qRaw.replace(/^ws[-_:]?/i, '')
    if (idNormalized.includes(qRaw) || idNormalized.includes(qStripped) || idNormalized === qStripped) return true
    const title = (t.title || '').toString().toLowerCase()
    const body = (t.body || '').toString().toLowerCase()
    return title.includes(q) || body.includes(q)
  }).sort((a, b) => b.created_at - a.created_at)
  const total = all.length
  const start = Math.max(0, (page - 1) * perPage)
  const slice = all.slice(start, start + perPage)

  // attach comment counts and a top comment preview (reuse logic from getThreads)
  const comments = (db.data.comments || [])
  const byThread = {}
  for (const c of comments) {
    byThread[c.thread_id] = byThread[c.thread_id] || []
    byThread[c.thread_id].push(c)
  }
  const mapped = slice.map(t => {
    const cs = byThread[t.id] || []
    let top = null
    if (cs.length > 0) {
      top = cs.slice().sort((a, b) => {
        const sa = (a.score || 0), sb = (b.score || 0)
        if (sb !== sa) return sb - sa
        return a.created_at - b.created_at
      })[0]
    }
    return { ...t, comment_count: cs.length, top_comment: top }
  })
  return { items: mapped, total }
}

async function createThread(thread) {
  await db.read()
  db.data = db.data || defaultData
  db.data.threads = db.data.threads || []
  db.data.threads.push(thread)
  await safeWrite()
  return thread
}

async function getThreadWithComments(id) {
  await db.read()
  const thread = (db.data.threads || []).find(t => t.id === id)
  if (!thread) return null
  const comments = (db.data.comments || []).filter(c => c.thread_id === id).sort((a, b) => a.created_at - b.created_at)
  return { thread, comments }
}

async function createComment(comment) {
  await db.read()
  db.data = db.data || defaultData
  db.data.comments = db.data.comments || []
  db.data.comments.push(comment)
  await safeWrite()
  return comment
}

async function addVote(vote) {
  await db.read()
  db.data = db.data || defaultData
  db.data.votes = db.data.votes || []
  // enforce one vote per voter per target (voter_id optional)
  const voter = vote.voter_id || null
  const existing = voter ? (db.data.votes || []).find(v => v.target_type === vote.target_type && v.target_id === vote.target_id && v.voter_id === voter) : null

  if (existing) {
    // if same vote value, toggle (remove) the existing vote
    if (existing.vote === vote.vote) {
      // remove existing vote and adjust counts
      const prev = existing.vote
      // remove from votes array
      db.data.votes = (db.data.votes || []).filter(v => v !== existing)
      if (vote.target_type === 'thread') {
        const t = (db.data.threads || []).find(x => x.id === vote.target_id)
        if (t) {
          if (prev === 1) { t.upvotes = Math.max(0, (t.upvotes || 1) - 1); t.score = (t.score || 0) - 1 }
          else { t.downvotes = Math.max(0, (t.downvotes || 1) - 1); t.score = (t.score || 0) + 1 }
        }
      } else {
        const c = (db.data.comments || []).find(x => x.id === vote.target_id)
        if (c) {
          c.score = (c.score || 0) - (prev === 1 ? 1 : -1)
        }
      }
      await safeWrite()
      if (vote.target_type === 'thread') return (db.data.threads || []).find(x => x.id === vote.target_id)
      return (db.data.comments || []).find(x => x.id === vote.target_id)
    }
    // different vote -> update counts by difference
    const prev = existing.vote
    existing.vote = vote.vote
    existing.created_at = vote.created_at || existing.created_at
    if (vote.target_type === 'thread') {
      const t = (db.data.threads || []).find(x => x.id === vote.target_id)
      if (t) {
        if (prev === 1 && vote.vote === -1) { t.upvotes = (t.upvotes || 1) - 1; t.downvotes = (t.downvotes || 0) + 1; t.score = (t.score || 0) - 2 }
        else if (prev === -1 && vote.vote === 1) { t.downvotes = (t.downvotes || 1) - 1; t.upvotes = (t.upvotes || 0) + 1; t.score = (t.score || 0) + 2 }
      }
    } else {
      const c = (db.data.comments || []).find(x => x.id === vote.target_id)
      if (c) {
        c.score = (c.score || 0) + (vote.vote === 1 ? 1 : -1) - (prev === 1 ? 1 : -1)
      }
    }
  } else {
    // new vote
    db.data.votes.push(vote)
    if (vote.target_type === 'thread') {
      const t = (db.data.threads || []).find(x => x.id === vote.target_id)
      if (t) {
        if (vote.vote === 1) { t.upvotes = (t.upvotes || 0) + 1; t.score = (t.score || 0) + 1 }
        else { t.downvotes = (t.downvotes || 0) + 1; t.score = (t.score || 0) - 1 }
      }
    } else {
      const c = (db.data.comments || []).find(x => x.id === vote.target_id)
      if (c) {
        c.score = (c.score || 0) + (vote.vote === 1 ? 1 : -1)
      }
    }
  }

  // Recompute target aggregates from votes to avoid double-counting drift
  if (vote.target_type === 'thread') {
    const t = (db.data.threads || []).find(x => x.id === vote.target_id)
    if (t) {
      const ups = (db.data.votes || []).filter(v => v.target_type === 'thread' && v.target_id === vote.target_id && v.vote === 1).length
      const downs = (db.data.votes || []).filter(v => v.target_type === 'thread' && v.target_id === vote.target_id && v.vote === -1).length
      t.upvotes = ups
      t.downvotes = downs
      t.score = (ups - downs)
    }
  } else {
    const c = (db.data.comments || []).find(x => x.id === vote.target_id)
    if (c) {
      const score = (db.data.votes || []).filter(v => v.target_type === 'comment' && v.target_id === vote.target_id).reduce((s, v) => s + (v.vote === 1 ? 1 : -1), 0)
      c.score = score
    }
  }

  await safeWrite()
  if (vote.target_type === 'thread') {
    return (db.data.threads || []).find(x => x.id === vote.target_id)
  }
  return (db.data.comments || []).find(x => x.id === vote.target_id)
}

// prune chat messages older than ttlSeconds; returns { changed: boolean, chat: array }
async function pruneChat(ttlSeconds) {
  await db.read()
  db.data = db.data || defaultData
  const now = Math.floor(Date.now() / 1000)
  const before = (db.data.chat || []).length
  // Only prune messages that are older than ttlSeconds AND not pinned by admin
  const old = (db.data.chat || []).filter(m => ((now - (m.created_at || 0)) >= ttlSeconds) && !m.pinned)
  db.data.chat = (db.data.chat || []).filter(m => ((now - (m.created_at || 0)) < ttlSeconds) || m.pinned)
  // remove uploaded files associated with pruned messages (if any)
  for (const m of old) {
    try {
      if (m && m.image) {
        const fn = path.basename(m.image || '')
        if (fn) {
          const p = path.join(__dirname, 'uploads', fn)
          try { await fsp.unlink(p) } catch (e) { /* ignore */ }
        }
      }
    } catch (e) { console.warn('failed to remove chat uploaded file', e) }
  }
  const after = db.data.chat.length
  let changed = false
  if (after !== before) {
    changed = true
    await safeWrite()
  }
  return { changed, chat: db.data.chat || [] }
}

// Admin token helpers
async function addAdminToken(token) {
  await db.read()
  db.data = db.data || defaultData
  db.data.admin_tokens = db.data.admin_tokens || []
  db.data.admin_tokens.push({ token, created_at: nowSec() })
  await safeWrite()
  return token
}

async function hasAdminToken(token) {
  if (!token) return false
  await db.read()
  db.data = db.data || defaultData
  db.data.admin_tokens = db.data.admin_tokens || []
  return (db.data.admin_tokens || []).some(t => t.token === token)
}

// delete thread and associated comments and votes
async function deleteThreadById(id) {
  await db.read()
  db.data = db.data || defaultData
  // find thread to delete (so we can remove uploaded files)
  const thread = (db.data.threads || []).find(t => t.id === id)
  // remove thread
  db.data.threads = (db.data.threads || []).filter(t => t.id !== id)
  // delete associated uploaded files (image and thumbnail) if present
  try {
    if (thread && thread.image) {
      const fn = path.basename(thread.image || '')
      if (fn) {
        const p = path.join(__dirname, 'uploads', fn)
        try { await fsp.unlink(p) } catch (e) { /* ignore */ }
      }
    }
    if (thread && thread.thumb) {
      const fn2 = path.basename(thread.thumb || '')
      if (fn2) {
        const p2 = path.join(__dirname, 'uploads', fn2)
        try { await fsp.unlink(p2) } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { console.warn('failed to remove uploaded files for thread', id, e) }
  // collect comment ids to remove
  const removedComments = (db.data.comments || []).filter(c => c.thread_id === id).map(c => c.id)
  db.data.comments = (db.data.comments || []).filter(c => c.thread_id !== id)
  // remove votes for that thread and for removed comments
  db.data.votes = (db.data.votes || []).filter(v => {
    if (v.target_type === 'thread' && v.target_id === id) return false
    if (v.target_type === 'comment' && removedComments.includes(v.target_id)) return false
    return true
  })
  await safeWrite()
  return { ok: true }
}

async function getAnnouncement() {
  await db.read()
  db.data = db.data || defaultData
  return db.data.announcement || null
}

async function setAnnouncement(text) {
  await db.read()
  db.data = db.data || defaultData
  db.data.announcement = text ? { text: text.toString(), created_at: Math.floor(Date.now()/1000) } : null
  await safeWrite()
  return db.data.announcement
}

// Rules helpers
async function getRules() {
  await db.read()
  db.data = db.data || defaultData
  return db.data.rules || null
}

async function setRules(text) {
  await db.read()
  db.data = db.data || defaultData
  db.data.rules = text ? { text: text.toString(), created_at: Math.floor(Date.now()/1000) } : null
  await safeWrite()
  return db.data.rules
}

// Reporting helpers
async function createReport(report) {
  await db.read()
  db.data = db.data || defaultData
  db.data.reports = db.data.reports || []
  const id = nanoid()
  const r = { id, target_type: report.target_type, target_id: report.target_id, reason: (report.reason || '').toString(), created_at: Math.floor(Date.now()/1000), resolved: false }
  db.data.reports.push(r)
  await safeWrite()
  return r
}

async function listReports() {
  await db.read()
  db.data = db.data || defaultData
  return (db.data.reports || []).slice().sort((a, b) => b.created_at - a.created_at)
}

async function resolveReport(id) {
  await db.read()
  db.data = db.data || defaultData
  const r = (db.data.reports || []).find(x => x.id === id)
  if (!r) return null
  r.resolved = true
  r.resolved_at = Math.floor(Date.now()/1000)
  await safeWrite()
  return r
}

async function deleteReport(id) {
  await db.read()
  db.data = db.data || defaultData
  const exists = (db.data.reports || []).some(x => x.id === id)
  if (!exists) return { ok: false }
  db.data.reports = (db.data.reports || []).filter(r => r.id !== id)
  await safeWrite()
  return { ok: true }
}

// Blocklist helpers
async function getBlocklist() {
  await db.read()
  db.data = db.data || defaultData
  return db.data.blocklist || []
}

async function setBlocklist(list) {
  await db.read()
  db.data = db.data || defaultData
  db.data.blocklist = Array.isArray(list) ? list.map(x => String(x).toLowerCase()) : []
  await safeWrite()
  return db.data.blocklist
}

// check whether a given text contains any blocked token (simple word-boundary check)
async function isBlocked(text) {
  if (!text) return false
  await db.read()
  db.data = db.data || defaultData
  const list = db.data.blocklist || []
  const lower = String(text).toLowerCase()
  for (const token of list) {
    if (!token) continue
    // treat token as plain substring or a simple word (use word boundaries)
    try {
      const re = new RegExp("\\b" + token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + "\\b", 'i')
      if (re.test(lower)) return true
    } catch (e) {
      // fallback substring
      if (lower.includes(token)) return true
    }
  }
  return false
}

// Audit log helpers
async function addAuditEntry(action, details, admin_token) {
  await db.read()
  db.data = db.data || defaultData
  db.data.audit = db.data.audit || []
  const id = nanoid()
  const entry = { id, action: action || 'unknown', details: details || {}, admin_token: admin_token || null, created_at: Math.floor(Date.now()/1000) }
  db.data.audit.push(entry)
  await safeWrite()
  return entry
}

async function listAudit() {
  await db.read()
  db.data = db.data || defaultData
  return (db.data.audit || []).slice().sort((a, b) => b.created_at - a.created_at)
}

// Reactions helpers: store per-voter reactions; aggregate on read
async function addReaction(r) {
  // r: { target_type, target_id, emoji, voter_id }
  await db.read()
  db.data = db.data || defaultData
  db.data.reactions = db.data.reactions || []
  const target_type = r.target_type
  const target_id = r.target_id
  const emoji = String(r.emoji || '')
  const voter = r.voter_id || null
  if (!target_type || !target_id || !emoji) return null
  // enforce one reaction per voter per emoji per target (toggle)
  if (voter) {
    const existing = (db.data.reactions || []).find(x => x.target_type === target_type && x.target_id === target_id && x.emoji === emoji && x.voter_id === voter)
    if (existing) {
      // remove (toggle off)
      db.data.reactions = (db.data.reactions || []).filter(x => x !== existing)
      await safeWrite()
      return await getReactionsForTarget(target_type, target_id)
    }
  }
  const id = nanoid()
  const created_at = Math.floor(Date.now()/1000)
  db.data.reactions.push({ id, target_type, target_id, emoji, voter_id: voter, created_at })
  await safeWrite()
  return await getReactionsForTarget(target_type, target_id)
}

async function getReactionsForTarget(target_type, target_id) {
  await db.read()
  db.data = db.data || defaultData
  const items = (db.data.reactions || []).filter(x => x.target_type === target_type && x.target_id === target_id)
  const byEmoji = {}
  for (const it of items) {
    byEmoji[it.emoji] = byEmoji[it.emoji] || { count: 0, voters: [] }
    byEmoji[it.emoji].count++
    if (it.voter_id) byEmoji[it.emoji].voters.push(it.voter_id)
  }
  return byEmoji
}

// Poll helpers: create poll attached to a thread, vote
async function createPoll(poll) {
  // poll: { thread_id, question, options: [label], ends_at (optional timestamp) }
  await db.read()
  db.data = db.data || defaultData
  db.data.polls = db.data.polls || []
  const id = nanoid()
  const created_at = Math.floor(Date.now()/1000)
  const options = (poll.options || []).map((label, idx) => ({ id: nanoid(), label: String(label || ''), votes: 0 }))
  const p = { id, thread_id: poll.thread_id || null, question: String(poll.question || ''), options, created_at, ends_at: poll.ends_at || null }
  db.data.polls.push(p)
  await safeWrite()
  return p
}

async function getPoll(id) {
  await db.read()
  db.data = db.data || defaultData
  return (db.data.polls || []).find(x => x.id === id) || null
}

async function getPollsForThread(thread_id) {
  await db.read()
  db.data = db.data || defaultData
  return (db.data.polls || []).filter(x => x.thread_id === thread_id)
}

async function votePoll(pollId, optionId, voter_id) {
  await db.read()
  db.data = db.data || defaultData
  db.data.polls = db.data.polls || []
  db.data.poll_votes = db.data.poll_votes || []
  const p = (db.data.polls || []).find(x => x.id === pollId)
  if (!p) return null
  // prevent double-voting by same voter: remove any prior vote
  if (voter_id) {
    db.data.poll_votes = (db.data.poll_votes || []).filter(v => !(v.poll_id === pollId && v.voter_id === voter_id))
  }
  // record vote
  const vid = nanoid()
  db.data.poll_votes.push({ id: vid, poll_id: pollId, option_id: optionId, voter_id: voter_id || null, created_at: Math.floor(Date.now()/1000) })
  // recompute option vote counts
  for (const opt of (p.options || [])) {
    opt.votes = (db.data.poll_votes || []).filter(v => v.poll_id === pollId && v.option_id === opt.id).length
  }
  await safeWrite()
  return p
}

// Modified report resolution: resolve one report and remove other reports targeting the same object
async function resolveReport(id) {
  await db.read()
  db.data = db.data || defaultData
  const r = (db.data.reports || []).find(x => x.id === id)
  if (!r) return null
  r.resolved = true
  r.resolved_at = Math.floor(Date.now()/1000)
  // remove other reports for same target (collapse duplicates)
  const others = (db.data.reports || []).filter(x => x.id !== id && x.target_type === r.target_type && x.target_id === r.target_id)
  const removedIds = others.map(x => x.id)
  if (removedIds.length > 0) {
    db.data.reports = (db.data.reports || []).filter(x => !removedIds.includes(x.id) && x.id !== id)
    // keep the resolved one in the list
    db.data.reports.push(r)
  }
  await safeWrite()
  return { resolved: r, removed: removedIds }
}

async function getChatMessages(limit = 200) {
  await db.read()
  const all = db.data.chat || []
  return all.slice(-limit)
}

async function addChatMessage(msg) {
  await db.read()
  db.data = db.data || defaultData
  db.data.chat = db.data.chat || []
  // ensure pinned flag defaults to false when adding
  if (msg) msg.pinned = !!msg.pinned
  // enforce blocklist: throw when message text contains blocked tokens
  if (msg && typeof msg.text === 'string') {
    const blocked = await isBlocked(msg.text)
    if (blocked) throw new Error('blocked_content')
  }
  db.data.chat.push(msg)
  await safeWrite()
  return msg
}

// set pinned flag for a chat message by id
async function setChatPinned(id, pinned) {
  await db.read()
  db.data = db.data || defaultData
  db.data.chat = db.data.chat || []
  const m = (db.data.chat || []).find(x => x.id === id)
  if (!m) return null
  m.pinned = !!pinned
  await safeWrite()
  return m
}

module.exports = {
  init,
  getThreads,
  searchThreads,
  createThread,
  getThreadWithComments,
  createComment,
  addVote,
  getChatMessages,
  addChatMessage,
  pruneChat,
  setChatPinned,
  addAdminToken,
  hasAdminToken,
  deleteThreadById,
  getAnnouncement,
  setAnnouncement,
  getRules,
  setRules,
  createReport,
  listReports,
  resolveReport,
  deleteReport,
  // blocklist
  getBlocklist,
  setBlocklist,
  isBlocked,
  // audit
  addAuditEntry,
  listAudit,
  // reactions
  addReaction,
  getReactionsForTarget,
  // polls
  createPoll,
  getPoll,
  votePoll,
  getPollsForThread
}
