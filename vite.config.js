import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '', '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:3001/api'
  
  return {
    plugins: [react()],
    base: '/',
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl)
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true
        }
      }
    }
  }
})