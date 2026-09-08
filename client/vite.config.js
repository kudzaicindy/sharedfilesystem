import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tiptap/core': path.resolve(dir, 'node_modules/@tiptap/core'),
      '@tiptap/pm': path.resolve(dir, 'node_modules/@tiptap/pm'),
    },
    dedupe: ['@tiptap/core', '@tiptap/pm', '@tiptap/react'],
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
