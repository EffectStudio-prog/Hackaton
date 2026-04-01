import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/chat': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/consultations': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/doctor-consultations': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    }
  }
})
