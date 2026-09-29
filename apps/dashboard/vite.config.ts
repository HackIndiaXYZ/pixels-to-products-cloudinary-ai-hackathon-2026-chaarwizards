import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React 19 + Vite 6 — matches ARCHITECTURE.md §3.5. Not Next.js (AGENTS.md §4).
//
// pnpm resolves `@vitejs/plugin-react`'s `vite` peer under a different
// peer-dependency hash than the dashboard's own `vite` devDependency, so
// TypeScript sees two structurally-identical but nominally-unrelated `Plugin`
// types. There is no runtime issue — both are `vite@6.4.3` — so the plugin
// array is widened to break the spurious nominal mismatch. `any` is permitted
// here by the ESLint flat config's `**/vite.config.ts` override. Vitest config
// lives in `vitest.config.ts`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plugins: any[] = [react()];

export default defineConfig({
  plugins,
  server: {
    port: 5173,
  },
});
