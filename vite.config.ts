import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'docs',
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  resolve: {
    alias: {
      // Add proper handling for .js imports from TypeScript
      '@': '/src',
    },
  },
  define: {
    // Ensure environment variables are available
    global: 'globalThis',
  },
  server: {
    port: 3000,
  },
});
