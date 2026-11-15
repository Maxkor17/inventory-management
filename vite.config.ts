import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';

// `base: './'` makes every asset URL relative, so the build works from any
// GitHub Pages path (e.g. /inventory-management/) without extra configuration.
export default defineConfig({
  base: './',
  plugins: [preact()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
