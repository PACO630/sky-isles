import { defineConfig } from 'vite';

// base './' lets the build work under any GitHub Pages sub-path (user.github.io/repo/)
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
