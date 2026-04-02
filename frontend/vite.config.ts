import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = 'http://localhost:8000'
const apiRoutes = [
  '/chat',
  '/predict',
  '/consultations',
  '/doctor-consultations',
  '/doctor-auth',
  '/doctors',
  '/auth',
  '/premium',
]

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Hackaton/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      apiRoutes.map(route => [
        route,
        {
          target: backendTarget,
          changeOrigin: true,
        },
      ])
    ),
  }
}))
