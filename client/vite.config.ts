import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core - rarely changes, good for caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Y.js collaboration - separate for caching
          'yjs-vendor': ['yjs', 'y-websocket'],
          // Icon libraries
          'icons-vendor': ['lucide-react'],
        },
      },
    },
  },
})
