import { expect, test } from '@playwright/test';

/**
 * BUILD_ORDER Phase 8 gate — E2E:
 *   login → pick project → search by tag → open asset → see integrity `pass`.
 *
 * Requires a running stack (API + Supabase + seeded verified asset) and
 * credentials in E2E_EMAIL / E2E_PASSWORD. Reported BLOCKED (needs user review)
 * until the user runs it against staging.
 */
test('login, pick project, search by tag, open asset, see integrity pass', async ({ page }) => {
  const email = process.env['E2E_EMAIL'];
  const password = process.env['E2E_PASSWORD'];
  test.skip(!email || !password, 'E2E_EMAIL / E2E_PASSWORD not set — needs a live stack.');

  await page.goto('/');

  // Login.
  await page.getByLabel('Email').fill(email as string);
  await page.getByLabel('Password').fill(password as string);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Pick a project from the tree.
  await page.getByTestId('project-node').first().click();

  // Search by tag.
  await page.getByRole('link', { name: 'Search' }).click();
  await page.getByLabel('tags').fill('planting');

  // Open the first result.
  await page.getByTestId('result-row').first().click();

  // Integrity panel shows pass.
  const overall = page.locator('[data-testid="integrity-panel"] header [data-verdict]');
  await expect(overall).toHaveAttribute('data-verdict', 'pass');
});
