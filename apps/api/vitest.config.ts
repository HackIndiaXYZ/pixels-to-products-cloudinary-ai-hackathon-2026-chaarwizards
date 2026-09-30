import { defineConfig } from 'vitest/config';

/**
 * API test + coverage config (BUILD_ORDER Phase 11 — "API 80%").
 *
 * The coverage thresholds are ENFORCED, not merely reported: vitest exits
 * non-zero when any metric falls below 80%, so CI fails the build (a threshold
 * that only prints a number and never fails is not a gate).
 *
 * Excluded from the denominator: entrypoints and wiring that only make sense
 * against real Supabase/Cloudinary/Redis (`start.ts`, `index.ts`, `jobs/*`, the
 * SDK adapters in `plugins/*`), the in-memory test doubles (`testing/*`), the
 * live-only Puppeteer render, type-only files, and the dev CLIs under `scripts/`.
 * What remains — routes, services, and lib — is the pure application logic the
 * 80% bar is meant to hold.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/start.ts',
        'src/index.ts',
        'src/types.ts',
        'src/ports.ts',
        'src/testing/**',
        'src/jobs/**',
        'src/plugins/supabase.ts',
        'src/plugins/cloudinary.ts',
        'src/plugins/cloudinary-admin.ts',
        'src/plugins/queue.ts',
        'src/reports/renderer.ts',
        'src/reports/renderer.live.test.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
