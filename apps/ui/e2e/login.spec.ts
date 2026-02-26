import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '시스템 로그인' })).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
  });

  test('should require username and password', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: '로그인' });
    await expect(submitBtn).toBeDisabled();
  });

  test('should toggle password visibility', async ({ page }) => {
    const pwInput = page.getByLabel('Password');
    await expect(pwInput).toHaveAttribute('type', 'password');

    await page.locator('button[tabindex="-1"]').click();
    await expect(pwInput).toHaveAttribute('type', 'text');

    await page.locator('button[tabindex="-1"]').click();
    await expect(pwInput).toHaveAttribute('type', 'password');
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.getByLabel('Username').fill('wronguser');
    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(page.getByText(/실패|잘못|invalid|error/i)).toBeVisible({ timeout: 10_000 });
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole('heading', { name: '시스템 로그인' })).toBeVisible();
    // On mobile, the animation panel should be hidden and form fills the screen
    const formArea = page.getByTestId('login-card');
    const box = await formArea.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
  });

  test('should show split layout on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: '시스템 로그인' })).toBeVisible();
    // Animation panel should be visible on desktop
    const formArea = page.getByTestId('login-card');
    const box = await formArea.boundingBox();
    // Form should take roughly half the screen (not the full width)
    expect(box!.width).toBeLessThan(640);
  });
});

test.describe('OTP Input', () => {
  test('should handle paste of 6-digit code', async ({ page }) => {
    test.skip(true, '2FA 활성화된 테스트 계정 필요');
  });
});
