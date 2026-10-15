import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev: gọi /api qua Vite để khỏi lo CORS (Laravel chạy ở cổng 8000)
    proxy: { '/api': 'http://localhost:8000' },
  },
})
