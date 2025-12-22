// import react from '@vitejs/plugin-react';
// import tailwindcss from '@tailwindcss/vite';
// import { defineConfig } from 'vite';
// import { nodePolyfills } from 'vite-plugin-node-polyfills';
// // import removeConsole from 'vite-plugin-remove-console';
// export default defineConfig({
//   plugins: [
//     react(),
//     tailwindcss(),
//     // removeConsole(),
//     nodePolyfills({
//       globals: {
//         Buffer: true,
//         global: true,
//         process: true,
//       },
//       protocolImports: true,
//     }),
//   ],
// });
import react from '@vitejs/plugin-react';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
// or your framework
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
});
