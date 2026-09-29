import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Component tests run under jsdom with @testing-library. Kept separate from
// `vite.config.ts` (build) so the app bundle carries no test tooling.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plugins: any[] = [react()];

export default defineConfig({
  plugins,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Playwright specs live under e2e/ and run with their own runner.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    // Syntactically-valid public placeholders so module-level Supabase client
    // construction succeeds under test. No secret: the anon key is client-safe
    // and these are throwaway locals (AGENTS.md §3.5).
    env: {
      VITE_API_URL: 'http://localhost:8787',
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_CLOUDINARY_CLOUD_NAME: 'demo',
      VITE_CLOUDINARY_UPLOAD_PRESET: 'verified_capture',
    },
  },
});
