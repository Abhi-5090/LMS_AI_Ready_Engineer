import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split big third-party libs into their own long-cached chunks instead of
        // one monolithic bundle (xlsx especially is large + rarely changes).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx')) return 'xlsx';
          // LiveKit (live classes) — only loaded when a user enters the room.
          if (id.includes('livekit')) return 'livekit';
          if (id.includes('gsap')) return 'gsap';
          if (id.includes('@tanstack')) return 'react-query';
          if (id.includes('react-router') || id.includes('@remix-run') || id.includes('react-dom') || /node_modules\/(react|scheduler)\//.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5050', changeOrigin: true },
      // Serve uploaded files (resources, certificates) from the backend in dev.
      '/uploads': { target: 'http://localhost:5050', changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    pool: 'vmThreads',
  },
});
