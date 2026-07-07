import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During development the Vite dev server runs on :5173 and proxies the
// Go backend's /api and /ws endpoints to :8080. In production, the Go
// server embeds and serves the built frontend/dist.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
