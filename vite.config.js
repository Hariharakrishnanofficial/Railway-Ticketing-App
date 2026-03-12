import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: false,   // allow Vite to try 3001, 3002... if 3000 is taken
    proxy: {
      // ALL /api/* requests are forwarded to the Flask backend on port 9000.
      // This means axios can use baseURL = '/api/' in local dev — no CORS,
      // no port mismatch, no hardcoded backend URL needed in the browser.
      '/api': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})