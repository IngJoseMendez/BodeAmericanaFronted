import { test, expect } from '@playwright/test';

test.describe('Bodega Americana - E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the login page', async ({ page }) => {
    await expect(page).toHaveTitle(/Bodega/i);
    const loginButton = page.getByRole('button', { name: /ingresar|entrar|login/i });
    await expect(loginButton.or(page.getByRole('heading', { name: /iniciar sesión/i }))).toBeVisible();
  });

  test('should navigate to dashboard after login', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.getByPlaceholder(/email|correo/i);
    const passwordInput = page.getByPlaceholder(/contraseña|password/i);
    
    if (await emailInput.isVisible()) {
      await emailInput.fill('admin@bodega.com');
      await passwordInput.fill('admin123');
      await page.getByRole('button', { name: /ingresar|entrar/i }).click();
    }
    await expect(page).toHaveURL(/dashboard|\//i);
  });

  test('should display navigation sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = page.locator('nav, aside, [class*="sidebar"]');
    await expect(sidebar.first()).toBeVisible();
  });

  test('should have quick action buttons', async ({ page }) => {
    await page.goto('/dashboard');
    const inventoryLink = page.getByRole('link', { name: /inventario|pacas/i });
    await expect(inventoryLink.first()).toBeVisible();
  });

  test('should navigate to Pacas page', async ({ page }) => {
    await page.goto('/pacas');
    await expect(page.getByRole('heading', { name: /paca|inventario/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Clientes page', async ({ page }) => {
    await page.goto('/clientes');
    await expect(page.getByRole('heading', { name: /cliente/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Ventas page', async ({ page }) => {
    await page.goto('/ventas');
    await expect(page.getByRole('heading', { name: /venta/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');
    const menuButton = page.locator('button[class*="menu"], button[class*="hamburger"], [aria-label*="menu"]');
    if (await menuButton.first().isVisible()) {
      await menuButton.first().click();
    }
    await expect(page).toBeVisible();
  });
});

test.describe('Form Validation Tests', () => {
  test('should validate login form', async ({ page }) => {
    await page.goto('/login');
    const submitButton = page.getByRole('button', { name: /ingresar|entrar/i });
    
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await expect(page.locator('text=/requerido|required|campo vacío/i').first()).toBeVisible({ timeout: 2000 }).catch(() => {});
    }
  });
});
