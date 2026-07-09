import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      // 로컬 API 서버 (npm run server) — Riot 키 은닉 + CORS 회피
      '/api': 'http://localhost:5175',
    },
  },
})
