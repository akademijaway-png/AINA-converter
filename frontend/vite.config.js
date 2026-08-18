import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react()
  ],
  build: {
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined
      }
    },
    chunkSizeWarningLimit: 5000,
    minify: 'esbuild',
    target: 'es2020'
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
