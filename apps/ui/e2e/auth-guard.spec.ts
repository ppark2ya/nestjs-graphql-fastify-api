import { test, expect } from '@playwright/test';

test.describe('Auth Guard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login');
    await page.evaluate(() => localStorage.clear());
  });

  test('should redirect to /admin/login when accessing /admin/live-stream without auth', async ({ page }) => {
    await page.goto('/admin/live-stream');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('should redirect to /admin/login when accessing /admin/history without auth', async ({ page }) => {
    await page.goto('/admin/history');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('should stay on /admin/login if already there', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { name: '시스템 로그인' })).toBeVisible();
  });
});
