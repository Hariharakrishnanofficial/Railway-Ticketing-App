import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: true,
    proxy: {
      // ALL /api/* requests are forwarded to the Flask backend on port 9000.
      // This means axios can use baseURL = '/api/' in local dev — no CORS,
      // no port mismatch, no hardcoded backend URL needed in the browser.
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})