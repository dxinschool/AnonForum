// small admin token store with subscribe notifications
const SUBS = new Set()
const KEY = 'admin_token'

export function getToken() {
  try { return localStorage.getItem(KEY) } catch (e) { return null }
}

export function setToken(token) {
  try { if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY) } catch (e) {}
  SUBS.forEach(fn => { try { fn(token) } catch (e) { console.warn('admin sub err', e) } })
}

export function subscribe(fn) { SUBS.add(fn); try { fn(getToken()) } catch(e){}; return () => SUBS.delete(fn) }

export default { getToken, setToken, subscribe }
