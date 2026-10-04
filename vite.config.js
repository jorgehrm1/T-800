import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // se registra en main.jsx solo en navegador (no dentro del APK)
      manifest: {
        name: 'T-800',
        short_name: 'T-800',
        start_url: '/',
        display: 'standalone',
        background_color: '#0F1B1E',
        theme_color: '#0F1B1E',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})
