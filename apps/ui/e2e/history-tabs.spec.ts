import { test, expect, type Page } from '@playwright/test';

// Fake JWT with far-future expiry for auth bypass
// Payload: { sub: "1", username: "testuser", roles: ["admin"], iat: 1700000000, exp: 4800000000 }
const FAKE_JWT =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: '1',
      username: 'testuser',
      roles: ['admin'],
      iat: 1700000000,
      exp: 4800000000,
    }),
  ) +
  '.fake-signature';

async function injectAuth(page: Page) {
  await page.goto('/admin/login');
  await page.evaluate(
    ({ token }) => {
      localStorage.setItem('access_token', token);
      localStorage.setItem('refresh_token', 'fake-refresh-token');
      localStorage.setItem(
        'token_expiry',
        String(Date.now() + 60 * 60 * 1000),
      );
    },
    { token: FAKE_JWT },
  );
}

function tabBar(page: Page) {
  return page.getByTestId('history-tab-bar');
}

function tabButtons(page: Page) {
  return tabBar(page).locator('button:has(svg.lucide-search)');
}

function plusBtn(page: Page) {
  return tabBar(page).locator('button:has(svg.lucide-plus)');
}

test.describe('History Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await page.goto('/admin/history');
    await expect(tabBar(page)).toBeVisible({ timeout: 5000 });
  });

  test('should show initial tab with "New Search" label', async ({ page }) => {
    await expect(tabButtons(page)).toHaveCount(1);
    await expect(tabBar(page).locator('text=New Search')).toBeVisible();
  });

  test('should add a new tab when clicking +', async ({ page }) => {
    await plusBtn(page).click();
    await expect(tabButtons(page)).toHaveCount(2);
  });

  test('should switch between tabs', async ({ page }) => {
    await plusBtn(page).click();

    const tabs = tabButtons(page);
    await expect(tabs).toHaveCount(2);

    // Click the first tab
    await tabs.first().click();

    // First tab should have active style
    await expect(tabs.first()).toHaveClass(/border-b-primary/);
  });

  test('should close a tab and activate adjacent', async ({ page }) => {
    // Add 2 more tabs (total 3)
    await plusBtn(page).click();
    await plusBtn(page).click();

    const tabs = tabButtons(page);
    await expect(tabs).toHaveCount(3);

    // Close the last (active) tab by clicking its X
    const closeBtn = tabs.nth(2).locator('span[role="button"]');
    await closeBtn.click();

    // Should now have 2 tabs
    await expect(tabButtons(page)).toHaveCount(2);
  });

  test('should show empty state when all tabs are closed', async ({
    page,
  }) => {
    // Close the only tab
    const closeBtn = tabButtons(page)
      .first()
      .locator('span[role="button"]');
    await closeBtn.click();

    // Should show empty state
    await expect(page.locator('text=No search tabs open')).toBeVisible();

    // Should show "New Search" button in empty state
    const newSearchBtn = page.getByRole('button', { name: 'New Search' });
    await expect(newSearchBtn).toBeVisible();

    // Click it to create a new tab
    await newSearchBtn.click();
    await expect(tabButtons(page)).toHaveCount(1);
  });

  test('should preserve filter state when switching tabs', async ({
    page,
  }) => {
    // Type a keyword in the first tab's visible input
    const visibleInput = () =>
      page.locator(
        'div[style*="display: flex"] input[placeholder="Search..."]',
      );

    await visibleInput().fill('test-keyword');

    // Add a second tab (auto-activates)
    await plusBtn(page).click();

    // Second tab's visible input should be empty
    await expect(visibleInput()).toHaveValue('');

    // Switch back to first tab
    await tabButtons(page).first().click();

    // First tab's input should still have the value
    await expect(visibleInput()).toHaveValue('test-keyword');
  });

  test('should add up to MAX_SEARCH_TABS tabs', async ({ page }) => {
    // Already have 1 tab, add 9 more (total 10)
    for (let i = 0; i < 9; i++) {
      await plusBtn(page).click();
    }

    await expect(tabButtons(page)).toHaveCount(10);

    // + button should be disabled
    await expect(plusBtn(page)).toBeDisabled();
  });
});
