import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      // serve uploaded images through the dev proxy so /uploads/* is forwarded to backend
      '/uploads': 'http://localhost:4000',
      // proxy socket.io websocket endpoint
      '/ws': {
        target: 'http://localhost:4000',
        ws: true
      }
    }
  }
})
