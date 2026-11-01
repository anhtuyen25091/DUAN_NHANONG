import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev: gọi /api qua Vite để khỏi lo CORS (Laravel chạy ở cổng 8000)
    proxy: {
      '/api': 'http://localhost:8000',
      // Máy chủ cảm biến (dự án iot/, cổng 8001): /iot/api/v1/... -> /api/v1/...
      '/iot': { target: 'http://localhost:8001', rewrite: (path) => path.replace(/^\/iot/, '') },
    },
  },
})
