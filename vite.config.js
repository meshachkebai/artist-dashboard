import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/artist-dashboard/',
  plugins: [react()],
  server: {
    port: 3002,
    host: true
  }
})
