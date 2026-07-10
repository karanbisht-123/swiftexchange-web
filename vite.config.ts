/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import removeConsole from 'vite-plugin-remove-console';

export default defineConfig(({ command }) => ({
  define: {
    ...(process.env.VITEST ? {} : { global: 'globalThis' }),
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
    include: [
      '@dydxprotocol/v4-client-js',
      '@skip-go/client',
      '@cosmjs/stargate',
      '@cosmjs/amino',
      '@cosmjs/proto-signing',
    ],
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
          if (id.includes('@dydxprotocol')) return 'vendor-dydx';
          if (id.includes('@stellar') || id.includes('@allbridge')) {
            return 'vendor-bridge-stellar';
          }
          if (id.includes('@cosmjs')) return 'vendor-cosmjs';
          if (id.includes('@skip-go')) return 'vendor-skip';
          if (id.includes('node_modules')) return 'vendor';
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
        external: [/@dydxprotocol/, /@cosmjs/, /protobufjs/],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/*.d.ts', '**/*.config.*', '**/node_modules/**', 'src/test/**'],
    },
  },
}));
