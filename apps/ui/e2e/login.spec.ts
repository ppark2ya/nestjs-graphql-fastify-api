import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/admin/login');
  });

  test('should display login form', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '시스템 로그인' }),
    ).toBeVisible();
    await expect(page.getByLabel('사용자 ID')).toBeVisible();
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
    await page.route('**/graphql', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [
            {
              message: '아이디와 패스워드를 확인해주세요.',
              extensions: {
                code: 'UNAUTHENTICATED',
                statusCode: 401,
                authErrorCode: '11010',
                downstreamService: 'auth',
              },
            },
          ],
          data: null,
        }),
      });
    });

    await page.getByLabel('사용자 ID').fill('wronguser');
    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(
      page.getByText('아이디와 패스워드를 확인해주세요.'),
    ).toBeVisible();
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(
      page.getByRole('heading', { name: '시스템 로그인' }),
    ).toBeVisible();
    const card = page.getByTestId('login-card');
    const box = await card.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe('OTP Input', () => {
  test('should handle paste of 6-digit code', async ({ page }) => {
    test.skip(true, '2FA 활성화된 테스트 계정 필요');
  });

  test('should show auth error message from verifyTwoFactor', async ({
    page,
  }) => {
    await page.route('**/graphql', async (route) => {
      const body = route.request().postDataJSON() as { query?: string };
      if (body.query?.includes('VerifyTwoFactor')) {
        expect(route.request().headers()['x-2fa-token']).toBe(
          'two-factor-token',
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [
              {
                message: 'OTP 코드가 올바르지 않습니다.',
                extensions: {
                  code: 'UNAUTHENTICATED',
                  statusCode: 401,
                  authErrorCode: '11011',
                  downstreamService: 'auth',
                },
              },
            ],
            data: null,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            login: {
              requiresTwoFactor: true,
              tokens: null,
              twoFactorToken: 'two-factor-token',
            },
          },
        }),
      });
    });

    await page.goto('/admin/login');
    await page.getByLabel('사용자 ID').fill('admin');
    await page.getByLabel('Password').fill('admin123');
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(
      page.getByRole('heading', { name: '2단계 인증' }),
    ).toBeVisible();
    await page.locator('input').last().fill('123456');
    await page.getByRole('button', { name: '인증하기' }).click();

    await expect(page.getByText('OTP 코드가 올바르지 않습니다.')).toBeVisible();
  });
});
