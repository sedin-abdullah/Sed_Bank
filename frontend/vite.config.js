import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      // Shared testid catalogue, imported by components AND the Playwright suite.
      '@shared': path.resolve(root, '..', 'shared'),
    },
  },
  server: {
    port: 5173,
    // Allow Vite to serve the sibling `shared/` directory.
    fs: { allow: [path.resolve(root, '..')] },
  },
  preview: { port: 4173 },
  build: { outDir: 'dist', sourcemap: false },
});
