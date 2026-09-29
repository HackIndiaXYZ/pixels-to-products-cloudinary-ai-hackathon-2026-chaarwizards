import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E for the two Phase 8 gate flows. `webServer` brings up both the
 * `@impact/api` (in-process launcher) and the Vite dev server, waits for them,
 * runs the specs, and tears them down — so the run is a single foreground
 * process with no lingering servers.
 *
 * Requires: a local Supabase stack seeded via `apps/api/e2e-scripts/e2e-seed.ts`,
 * installed browsers (`pnpm exec playwright install chromium`), and these env
 * vars at invocation: E2E_EMAIL, E2E_PASSWORD (the seeded member), and
 * E2E_ANON_KEY / E2E_SERVICE_KEY (local Supabase keys, forwarded to the API).
 * Without E2E_EMAIL/E2E_PASSWORD the specs `test.skip` (BLOCKED, needs a stack).
 */
const runServers = process.env['E2E_EMAIL'] !== undefined && process.env['E2E_PASSWORD'] !== undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(runServers
    ? {
        webServer: [
          {
            command: 'pnpm --filter @impact/api exec tsx e2e-scripts/e2e-api.ts',
            url: 'http://127.0.0.1:8080/health',
            reuseExistingServer: !process.env['CI'],
            timeout: 60_000,
            cwd: '../..',
          },
          {
            command: 'pnpm --filter @impact/dashboard exec vite --port 5173 --host 127.0.0.1',
            url: 'http://127.0.0.1:5173',
            reuseExistingServer: !process.env['CI'],
            timeout: 60_000,
            cwd: '../..',
          },
        ],
      }
    : {}),
});
