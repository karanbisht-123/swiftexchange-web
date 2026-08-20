/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';

import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import removeConsole from 'vite-plugin-remove-console';

export default defineConfig(({ command }) => ({
  define: {
    ...(process.env.VITEST ? {} : { global: 'globalThis' }),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8081,
    strictPort: true,
    proxy: {
      '/pnl': {
        target: 'https://folioapi.swiftexwallet.com',
        changeOrigin: true,
      },
    },
  },

  plugins: [
    react(),
    tailwindcss(),
    command === 'build' && removeConsole(),
    nodePolyfills({
      globals: { Buffer: true, global: true },
      protocolImports: true,
    }),
  ].filter(Boolean),

  optimizeDeps: {
    exclude: ['buffer', 'process', 'vm-browserify', 'node-stdlib-browser'],
    esbuildOptions: {
      target: 'esnext',
      define: {
        ...(process.env.VITEST ? {} : { global: 'globalThis' }),
      },
    },
  },

  build: {
    target: 'esnext',
    sourcemap: false,
    minify: 'esbuild',
    modulePreload: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/ethers/') || id.includes('node_modules/bignumber.js/')) {
            return 'vendor-ethers';
          }
          if (id.includes('node_modules/@stellar/')) {
            return 'vendor-stellar';
          }
          if (id.includes('node_modules/lightweight-charts')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/@walletconnect/')) {
            return 'vendor-walletconnect';
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
        },
      },
      onwarn(warning, warn) {
        if (warning.code === 'EVAL') return;
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        if (warning.code === 'INVALID_ANNOTATION') return;
        warn(warning);
      },
    },
  },

  esbuild: {
    legalComments: 'none',
    target: 'esnext',
  },

  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    css: false,
    server: {
      deps: {
        inline: ['html-encoding-sniffer', '@exodus/bytes'],
        external: [],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/*.d.ts', '**/*.config.*', '**/node_modules/**', 'src/test/**'],
    },
  },
}));
