import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* One root entry (`index.html`) with no code splitting between the shell and the review harness:
   both mount from `src/main.tsx`, and `?state=` selects the harness. */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});