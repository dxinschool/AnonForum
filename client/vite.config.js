import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Improve HMR and websocket behavior for dev tunnels by preferring secure WS and
    // accepting connections from external hosts. This helps when using VS Code dev tunnels.
    // Use plain ws for local development to avoid wss failures when not using HTTPS.
    // If you intentionally run the dev server over HTTPS (with a valid cert),
    // change this to { protocol: 'wss' } or set via env.
    hmr: {
      protocol: 'ws'
    },
    proxy: {
      // proxy application API requests to the backend server (port 4000)
      '/api': 'http://localhost:4000',
      // serve uploaded images through the dev proxy so /uploads/* is forwarded to backend
      '/uploads': 'http://localhost:4000',
      // proxy raw websocket endpoint used by the backend (/ws). Use explicit ws:// target
      // and add error handler to avoid noisy ECONNRESET traces when clients disconnect.
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
        changeOrigin: true,
        secure: false,
        onError(err, req, res) {
          // swallow common ECONNRESET noise; log other errors at debug level
          if (err && err.code === 'ECONNRESET') {
            // optional: console.debug('vite proxy ws ECONNRESET (expected when clients disconnect)')
          } else {
            console.warn('vite proxy ws error', err && err.message)
          }
        }
      }
    }
  }
})
