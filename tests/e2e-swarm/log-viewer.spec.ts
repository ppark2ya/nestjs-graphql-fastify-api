import { test, expect } from '@playwright/test';

test.describe('Log Viewer E2E (Apache + Swarm)', () => {
  test('should load log-viewer UI via Apache reverse proxy', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Docker Log Viewer');
    await expect(page.locator('h2')).toContainText('Containers');
  });

  test('should display container list from Swarm', async ({ page }) => {
    await page.goto('/');

    // 컨테이너 목록 로드 대기
    await expect(page.locator('text=Loading containers...')).toBeHidden({ timeout: 15_000 });

    // 컨테이너가 1개 이상 표시되어야 함
    const containerCount = page.locator('text=/\\d+ containers/');
    await expect(containerCount).toBeVisible({ timeout: 10_000 });
  });

  test('should show Swarm service groups with replicas', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Loading containers...')).toBeHidden({ timeout: 15_000 });

    // Swarm 서비스 그룹 중 2개 이상의 replica를 가진 서비스가 있어야 함
    const serviceGroup = page.locator('button:has-text("2 replicas")').first();
    await expect(serviceGroup).toBeVisible({ timeout: 10_000 });

    const replicaText = await serviceGroup.locator('text=/\\d+ replicas/').textContent();
    const replicaCount = parseInt(replicaText?.match(/(\d+)\s*replicas/)?.[1] ?? '0');
    expect(replicaCount).toBeGreaterThanOrEqual(2);
  });

  test('should receive real-time logs via GraphQL Subscription', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Loading containers...')).toBeHidden({ timeout: 15_000 });

    // 로그를 활발히 출력하는 gateway 서비스 그룹 클릭
    const serviceGroup = page.locator('button:has-text("e2e_gateway")');
    await serviceGroup.click();

    // 로그 뷰어가 열리고 로그가 수신되길 대기
    await expect(page.locator('text=Waiting for logs')).toBeVisible({ timeout: 5_000 });

    // 로그가 수신될 때까지 대기 (최대 30초)
    const logLine = page.locator('text=/stdout|stderr/').first();
    await expect(logLine).toBeVisible({ timeout: 30_000 });

    // 로그 카운트가 증가했는지 확인
    const lineCount = page.locator('text=/\\d+ lines/');
    await expect(lineCount).toBeVisible();
    const countText = await lineCount.textContent();
    const count = parseInt(countText?.match(/(\d+)/)?.[1] ?? '0');
    expect(count).toBeGreaterThan(0);
  });

  test('should show logs from multiple nodes (nodeName)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Loading containers...')).toBeHidden({ timeout: 15_000 });

    // gateway 서비스 그룹 클릭 (2 replicas)
    const serviceGroup = page.locator('button:has-text("e2e_gateway")');
    await serviceGroup.click();

    // replica legend에 노드 정보(@hostname)가 표시되는지 확인
    const nodeBadge = page.locator('text=/@/').first();
    await expect(nodeBadge).toBeVisible({ timeout: 10_000 });
  });

});
