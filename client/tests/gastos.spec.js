import { test, expect } from '@playwright/test';

test.describe('Gastos E2E', () => {
  test('should load gastos page', async ({ page }) => {
    await page.goto('/gastos');
    await expect(page.getByRole('heading', { name: /gasto/i }).first()).toBeVisible({ timeout: 5000 });
  });
});
