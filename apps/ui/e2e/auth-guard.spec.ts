import { test, expect } from '@playwright/test';

test.describe('Auth Guard', () => {
  test('should redirect to /login when accessing / without auth', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should redirect to /login when accessing /history without auth', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/history');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should stay on /login if already there', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: '시스템 로그인' })).toBeVisible();
  });
});
