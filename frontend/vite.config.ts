import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: process.env.DEV_API_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
      '/properties': {
        target: process.env.DEV_API_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: process.env.DEV_API_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
