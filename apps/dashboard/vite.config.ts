import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/* One root entry (`index.html`) with no code splitting between the shell and the review harness:
   both mount from `src/main.tsx`, and `?state=` selects the harness. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const configuredApiTarget = env.VITE_API_URL ?? env.VITE_PANCHNAMA_API_BASE;
  const apiTarget = configuredApiTarget?.replace(/\/+$/, '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: false,
      ...(apiTarget
        ? {
            proxy: {
              '/api': {
                target: apiTarget,
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/api/, ''),
              },
            },
          }
        : {}),
    },
    preview: { port: 4173 },
    build: {
      target: 'es2022',
      sourcemap: true,
      chunkSizeWarningLimit: 900,
    },
  };
});