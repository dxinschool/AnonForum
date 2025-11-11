const API = {
  // optional `q` string to search threads (server-side). Supports pagination via page and perPage.
  // Returns an object: { items: [...], total, page, per_page, total_pages }
  listThreads: async (q, page = 1, perPage = 5) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (page) params.set('page', String(page))
    if (perPage) params.set('per_page', String(perPage))
    const url = '/api/threads?' + params.toString()
    const res = await fetch(url)
    return res.json()
  },
  createThread: async (title, body, tags) => {
    const res = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, tags })
    });
    return res.json();
  },
  // createThread with optional file: if `file` is provided, pass FormData as { title, body, image }
  createThreadWithFile: async (title, body, file, tags) => {
    const fd = new FormData()
    fd.append('title', title)
    fd.append('body', body)
    if (tags) fd.append('tags', Array.isArray(tags) ? JSON.stringify(tags) : String(tags))
    fd.append('image', file)
    const res = await fetch('/api/threads', {
      method: 'POST',
      body: fd
    })
    return res.json()
  },
  getThread: async (id) => {
    const res = await fetch(`/api/threads/${id}`);
    return res.json();
  },
  postComment: async (threadId, parent_id, body) => {
    const res = await fetch(`/api/threads/${threadId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id, body })
    });
    return res.json();
  },
  adminLogin: async (password) => {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    return res.json()
  },
  adminAnnounce: async (text) => {
    const token = localStorage.getItem('admin_token')
    const res = await fetch('/api/admin/announce', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify({ text })
    })
    return res.json()
  },
  getAnnouncement: async () => {
    const res = await fetch('/api/announcement')
    return res.json()
  },
  // rules
  getRules: async () => {
    const res = await fetch('/api/rules')
    return res.json()
  },
  adminSetRules: async (text) => {
    const token = localStorage.getItem('admin_token')
    const res = await fetch('/api/admin/rules', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify({ text })
    })
    return res.json()
  },
  // reporting
  report: async (target_type, target_id, reason) => {
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type, target_id, reason })
    })
    return res.json()
  },
  // admin report actions
  listReports: async () => {
    const token = localStorage.getItem('admin_token')
    const res = await fetch('/api/admin/reports', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    return res.json()
  },
  resolveReport: async (id) => {
    const token = localStorage.getItem('admin_token')
    const res = await fetch(`/api/admin/reports/${id}/resolve`, { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {} })
    return res.json()
  },
  deleteThread: async (id) => {
    const token = localStorage.getItem('admin_token')
    const res = await fetch(`/api/threads/${id}`, {
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
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type, target_id, vote, voter_id: voter })
    });
    return res.json();
  }
}

export default API;
