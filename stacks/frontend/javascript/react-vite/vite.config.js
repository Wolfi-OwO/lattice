import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: {{clientPort}},
    // Proxying /api in dev means the browser only ever talks to one origin,
    // so there is no CORS and no absolute API URL baked into the code.
    proxy: {
      '/api': {
        target: 'http://localhost:{{port}}',
        changeOrigin: true,
      },
    },
  },
});
