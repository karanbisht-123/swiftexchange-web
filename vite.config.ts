import react from '@vitejs/plugin-react';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import removeConsole from 'vite-plugin-remove-console';

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  plugins: [
    react(),
    tailwindcss(),
    removeConsole(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
      },
      protocolImports: true,
    }),
  ],
  optimizeDeps: {
    include: ['buffer', 'process', 'vm-browserify'],
  },
});
