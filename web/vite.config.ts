import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev: gọi /api qua Vite để khỏi lo CORS (Laravel chạy ở cổng 8000)
    proxy: {
      // Giữ Host gốc (vd 192.168.1.7:5174) để link ảnh bài viết máy chủ trả về mở được trên điện thoại
      '/api': { target: 'http://localhost:8000', changeOrigin: false },
      // Ảnh bài viết (ảnh bìa, ảnh chèn trong bài) lưu ở storage/app/public của Laravel
      '/storage': 'http://localhost:8000',
      // Máy chủ cảm biến (dự án iot/, cổng 8001): /iot/api/v1/... -> /api/v1/...
      '/iot': { target: 'http://localhost:8001', rewrite: (path) => path.replace(/^\/iot/, '') },
    },
  },
})
