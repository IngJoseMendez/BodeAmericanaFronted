import { test, expect } from '@playwright/test';

test.describe('Deuda masiva E2E', () => {
  test('should load deuda masiva page', async ({ page }) => {
    await page.goto('/deuda-masiva');
    await expect(page.getByRole('heading', { name: /deuda masiva/i }).first()).toBeVisible({ timeout: 5000 });
  });
});
