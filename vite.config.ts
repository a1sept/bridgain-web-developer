import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Server-only settings come from the process (Compose); never load the root env into Vite.
export default defineConfig({
  plugins: [react()],
  envPrefix: 'VITE_PUBLIC_',
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: process.env.DEV_ALLOWED_HOST ? [process.env.DEV_ALLOWED_HOST] : [],
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
