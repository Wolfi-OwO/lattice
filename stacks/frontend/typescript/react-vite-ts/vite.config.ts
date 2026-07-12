import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: {{clientPort}},
    // Proxying /api in dev means one origin in the browser: no CORS, and no
    // absolute API URL baked into the source.
    proxy: {
      '/api': {
        target: 'http://localhost:{{port}}',
        changeOrigin: true,
      },
    },
  },
});
