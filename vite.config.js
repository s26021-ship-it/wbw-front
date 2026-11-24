import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = 'https://sealed-matt-desired-wesley.trycloudflare.com';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        secure: true
      },
      '/oauth2': {
        target: backend,
        changeOrigin: true,
        secure: true
      },
      '/login/oauth2': {
        target: backend,
        changeOrigin: true,
        secure: true
      }
    }
  }
});