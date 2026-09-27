import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React 19 + Vite 6 — matches ARCHITECTURE.md §3.5. Not Next.js (AGENTS.md §4).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
