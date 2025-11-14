import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo })
    // optionally send to server or localStorage for later debugging
    try {
      const payload = { error: String(error), info: errorInfo && errorInfo.componentStack }
      try { localStorage.setItem('last_error', JSON.stringify(payload)) } catch (e) {}
    } catch (e) {}
  }

  render() {
    const { error, errorInfo } = this.state
    if (error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', color: '#111' }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
          <div style={{ background: '#fff', border: '1px solid #ccc', padding: 12, borderRadius: 6 }}>
            <p style={{ margin: '8px 0', color: '#900' }}><strong>{String(error && error.toString && error.toString())}</strong></p>
            {errorInfo && <pre style={{ whiteSpace: 'pre-wrap', color: '#333', fontSize: 12 }}>{errorInfo.componentStack}</pre>}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => window.location.reload()}>Reload</button>
              <button className="btn" onClick={() => { try { navigator.clipboard.writeText(JSON.stringify({ error: String(error), stack: errorInfo && errorInfo.componentStack })) } catch (e) { alert('Copy failed, open console to inspect error') }}}>Copy</button>
              <button className="btn" onClick={() => { window.scrollTo(0, 0); }}>Top</button>
            </div>
            <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>Open developer console (F12) for details.</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
