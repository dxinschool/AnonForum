let subs = new Set()
let idCounter = 1

export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn) }

export function show(text, opts = {}) {
  const id = 't' + (idCounter++)
  const t = { id, text, ttl: opts.ttl || 3000 }
  subs.forEach(fn => { try { fn({ type: 'add', toast: t }) } catch (e) {} })
  if (t.ttl > 0) setTimeout(() => {
    subs.forEach(fn => { try { fn({ type: 'remove', id }) } catch (e) {} })
  }, t.ttl)
  return id
}

export function remove(id) {
  subs.forEach(fn => { try { fn({ type: 'remove', id }) } catch (e) {} })
}

export default { subscribe, show, remove }
