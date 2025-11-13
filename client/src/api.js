// Allow overriding the API base at build time with Vite env var VITE_API_BASE.
// If not provided, client will use same-origin relative paths (empty base).
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) ? String(import.meta.env.VITE_API_BASE).replace(/\/$/, '') : ''

function apiUrl(path) {
  if (!path) return API_BASE || path
  if (!API_BASE) return path
  // ensure single slash between base and path
  return API_BASE.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path)
}

function apiFetch(path, opts) {
  return fetch(apiUrl(path), opts)
}

const API = {
  // optional `q` string to search threads (server-side). Supports pagination via page and perPage.
  // Returns an object: { items: [...], total, page, per_page, total_pages }
  listThreads: async (q, page = 1, perPage = 5) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (page) params.set('page', String(page))
    if (perPage) params.set('per_page', String(perPage))
    const url = '/api/threads?' + params.toString()
    const res = await apiFetch(url)
    return res.json()
  },
  createThread: async (title, body, tags) => {
    const res = await apiFetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, tags })
    });
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (!res.ok) {
      try {
        if (ct.includes('application/json')) {
          const j = await res.json()
          throw new Error((j && (j.error || j.message)) ? (j.error || j.message) : JSON.stringify(j))
        }
        const t = await res.text()
        throw new Error(t || 'create thread failed')
      } catch (e) { throw e }
    }
    return res.json();
  },
  // createThread with optional file: if `file` is provided, pass FormData as { title, body, image }
  createThreadWithFile: async (title, body, file, tags) => {
    const fd = new FormData()
    fd.append('title', title)
    fd.append('body', body)
    if (tags) fd.append('tags', Array.isArray(tags) ? JSON.stringify(tags) : String(tags))
    fd.append('image', file)
    const res = await apiFetch('/api/threads', {
      method: 'POST',
      body: fd
    })
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (!res.ok) {
      try {
        if (ct.includes('application/json')) {
          const j = await res.json()
          throw new Error((j && (j.error || j.message)) ? (j.error || j.message) : JSON.stringify(j))
        }
        const t = await res.text()
        throw new Error(t || 'create thread failed')
      } catch (e) { throw e }
    }
    return res.json()
  },
  getThread: async (id) => {
    const res = await apiFetch(`/api/threads/${id}`);
    return res.json();
  },
  postComment: async (threadId, parent_id, body) => {
    const res = await apiFetch(`/api/threads/${threadId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id, body })
    });
    return res.json();
  },
  adminLogin: async (password) => {
    const res = await apiFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    return res.json()
  },
  adminAnnounce: async (text) => {
    const token = localStorage.getItem('admin_token')
    const res = await apiFetch('/api/admin/announce', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify({ text })
    })
    return res.json()
  },
  getAnnouncement: async () => {
    const res = await apiFetch('/api/announcement')
    return res.json()
  },
  // rules
  getRules: async () => {
    const res = await apiFetch('/api/rules')
    return res.json()
  },
  adminSetRules: async (text) => {
    const token = localStorage.getItem('admin_token')
    const res = await apiFetch('/api/admin/rules', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify({ text })
    })
    return res.json()
  },
  // reporting
  report: async (target_type, target_id, reason) => {
    const res = await apiFetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type, target_id, reason })
    })
    return res.json()
  },
  // admin report actions
  listReports: async () => {
    const token = localStorage.getItem('admin_token')
    const res = await apiFetch('/api/admin/reports', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    return res.json()
  },
  resolveReport: async (id) => {
    const token = localStorage.getItem('admin_token')
    const res = await apiFetch(`/api/admin/reports/${id}/resolve`, { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {} })
    return res.json()
  },
  deleteReport: async (id) => {
    const token = localStorage.getItem('admin_token')
    const res = await apiFetch(`/api/admin/reports/${id}`, { method: 'DELETE', headers: token ? { Authorization: 'Bearer ' + token } : {} })
    // Some servers return 204 No Content or plain text on delete — handle non-JSON safely
    if (res.status === 204) return {}
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) return res.json()
    const txt = await res.text()
    try { return JSON.parse(txt) } catch (e) { return txt }
  },
  // admin: pin/unpin chat message
  adminPinChat: async (id, pinned) => {
    const token = localStorage.getItem('admin_token')
    const res = await apiFetch(`/api/admin/chat/${encodeURIComponent(id)}/pin`, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify({ pinned: !!pinned })
    })
    return res.json()
  },
  deleteThread: async (id) => {
    const token = localStorage.getItem('admin_token')
    const res = await apiFetch(`/api/threads/${id}`, {
      method: 'DELETE',
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    })
    return res.json()
  },
  vote: async (target_type, target_id, vote) => {
    // ensure an anon voter id in localStorage
    let voter = localStorage.getItem('anon_id')
    if (!voter) {
      voter = 'anon_' + Math.random().toString(36).slice(2, 10)
      try { localStorage.setItem('anon_id', voter) } catch (e) { /* ignore */ }
    }
    const res = await apiFetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type, target_id, vote, voter_id: voter })
    });
    return res.json();
  }
  ,
  // reactions
  getReactions: async (target_type, target_id) => {
    const params = new URLSearchParams()
    params.set('target_type', target_type)
    params.set('target_id', target_id)
    const res = await apiFetch('/api/reactions?' + params.toString())
    return res.json()
  },
  addReaction: async (target_type, target_id, emoji, voter_id) => {
    const res = await apiFetch('/api/reactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type, target_id, emoji, voter_id })
    })
    // handle non-JSON or empty responses gracefully to avoid JSON.parse errors
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (!res.ok) {
      // try to parse error body if JSON, otherwise throw text
      try {
        if (ct.includes('application/json')) {
          const j = await res.json()
          throw new Error(j && j.error ? j.error : JSON.stringify(j))
        }
        const t = await res.text()
        throw new Error(t || 'reaction failed')
      } catch (e) { throw e }
    }
    try {
      if (ct.includes('application/json')) return await res.json()
      const txt = await res.text()
      try { return JSON.parse(txt) } catch (e) { return {} }
    } catch (e) {
      console.warn('addReaction parse failed', e)
      return {}
    }
  },
  // polls
  createPoll: async (thread_id, question, options, ends_at) => {
    const res = await apiFetch('/api/polls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id, question, options, ends_at }) })
    return res.json()
  },
  getPoll: async (id) => {
    const res = await apiFetch('/api/polls/' + encodeURIComponent(id))
    return res.json()
  },
  listPollsForThread: async (threadId) => {
    const res = await apiFetch(`/api/threads/${encodeURIComponent(threadId)}/polls`)
    return res.json()
  },
  votePoll: async (pollId, option_id, voter_id) => {
    const res = await apiFetch(`/api/polls/${encodeURIComponent(pollId)}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ option_id, voter_id }) })
    return res.json()
  },
  // admin blocklist & audit
  adminGetBlocklist: async () => {
    const token = localStorage.getItem('admin_token')
    const res = await apiFetch('/api/admin/blocklist', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    return res.json()
  },
  adminSetBlocklist: async (list) => {
    const token = localStorage.getItem('admin_token')
    const res = await apiFetch('/api/admin/blocklist', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify({ list }) })
    return res.json()
  },
  adminListAudit: async () => {
    const token = localStorage.getItem('admin_token')
    const res = await apiFetch('/api/admin/audit', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    return res.json()
  }
}

export default API;
