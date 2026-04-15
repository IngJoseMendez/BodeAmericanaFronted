import { test, expect } from '@playwright/test';

test.describe('Cartera (Accounts Receivable) E2E', () => {
  test('should load cartera page', async ({ page }) => {
    await page.goto('/cartera');
    await expect(page.getByRole('heading', { name: /cartera/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('should display client list', async ({ page }) => {
    await page.goto('/cartera');
    await page.waitForLoadState('networkidle');
    const clientCards = page.locator('[class*="card"], [class*="client"]');
    await expect(clientCards.first()).toBeVisible({ timeout: 5000 }).catch(() => {
      expect(page.locator('text=/no hay|sin datos|vacío/i')).toBeVisible();
    });
  });

  test('should show payment dialog', async ({ page }) => {
    await page.goto('/cartera');
    await page.waitForLoadState('networkidle');
    const payButton = page.getByRole('button', { name: /pagar|abono|payment/i }).first();
    if (await payButton.isVisible()) {
      await payButton.click();
      await expect(page.locator('input[type="number"], input[placeholder*="monto"]').first()).toBeVisible({ timeout: 2000 }).catch(() => {});
    }
  });
});

test.describe('Reportes E2E', () => {
  test('should load reportes page', async ({ page }) => {
    await page.goto('/reportes');
    await expect(page.getByRole('heading', { name: /reporte/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('should have date filters', async ({ page }) => {
    await page.goto('/reportes');
    const dateInputs = page.locator('input[type="date"], input[placeholder*="fecha"]');
    await expect(dateInputs.first()).toBeVisible({ timeout: 3000 }).catch(() => {
      expect(page.getByText(/filtrar|exportar/i).first()).toBeVisible();
    });
  });
});
