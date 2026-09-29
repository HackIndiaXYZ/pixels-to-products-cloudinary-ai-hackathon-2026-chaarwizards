import { expect, test } from '@playwright/test';

/**
 * BUILD_ORDER Phase 8 gate — E2E:
 *   a quarantined asset is visible in the admin queue and absent from report
 *   selection.
 *
 * Requires a running stack with a seeded flagged (quarantined) asset and login
 * credentials in E2E_EMAIL / E2E_PASSWORD. Reported BLOCKED (needs user review)
 * until the user runs it against staging.
 */
test('quarantined asset shows in the admin queue', async ({ page }) => {
  const email = process.env['E2E_EMAIL'];
  const password = process.env['E2E_PASSWORD'];
  test.skip(!email || !password, 'E2E_EMAIL / E2E_PASSWORD not set — needs a live stack.');

  await page.goto('/');
  await page.getByLabel('Email').fill(email as string);
  await page.getByLabel('Password').fill(password as string);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByRole('link', { name: 'Admin queue' }).click();

  // At least one quarantined row is present.
  await expect(page.getByTestId('quarantine-row').first()).toBeVisible();

  // And a flagged asset never appears as a report-selectable option.
  await expect(page.getByTestId('report-selectable-flagged')).toHaveCount(0);
});
