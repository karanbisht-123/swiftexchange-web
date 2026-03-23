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
      globals: { Buffer: true, global: true },
      protocolImports: true,
    }),
  ],

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
      define: { global: 'globalThis' },
    },
  },

  build: {
    target: 'esnext',
    sourcemap: false,
    minify: 'esbuild',        // explicit esbuild minifier
    modulePreload: false,     //tops import-analysis from re-parsing chunks
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,

    rollupOptions: {
      output: {
        manualChunks(id) {
          //isolate SDK chunks so they aren't merged into the main bundle
          if (id.includes('@dydxprotocol')) return 'vendor-dydx';
          if (id.includes('@stellar')) return 'vendor-stellar';
          if (id.includes('@allbridge')) return 'vendor-allbridge';
          if (id.includes('@cosmjs')) return 'vendor-cosmjs';
          if (id.includes('@skip-go')) return 'vendor-skip';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
      onwarn(warning, warn) {
        if (warning.code === 'EVAL') return;
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
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
});