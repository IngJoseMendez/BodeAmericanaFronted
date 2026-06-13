import { test, expect } from '@playwright/test';

test.describe('Histórico E2E', () => {
  test('should load historico page', async ({ page }) => {
    await page.goto('/historico');
    await expect(page.getByRole('heading', { name: /hist[oó]rico/i }).first()).toBeVisible({ timeout: 5000 });
  });
});
