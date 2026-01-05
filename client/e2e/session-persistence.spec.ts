import { test, expect } from './fixtures';

test.describe('Session Persistence', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should persist game state on refresh', async ({ page }) => {
    // Make a move: e2 to e4
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    
    // Verify move was recorded
    await expect(page.locator('.move-tree-container')).toContainText('e4', { timeout: 5000 });
    await expect(page.locator('.turn-indicator')).toContainText(/Black to move/i);
    
    // Refresh the page
    await page.reload();
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Verify game state persisted
    await expect(page.locator('.move-tree-container')).toContainText('e4', { timeout: 5000 });
    await expect(page.locator('.turn-indicator')).toContainText(/Black to move/i);
  });

  test('should persist multiple moves on refresh', async ({ page }) => {
    // Make two moves: 1. e4 e5
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(300);
    
    await page.locator('[data-square="e7"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e5"]').click();
    
    // Verify moves were recorded
    await expect(page.locator('.move-tree-header .move-count')).toContainText('2 / 2', { timeout: 5000 });
    
    // Refresh the page
    await page.reload();
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Verify game state persisted
    await expect(page.locator('.move-tree-header .move-count')).toContainText('2 / 2', { timeout: 5000 });
    await expect(page.locator('.move-tree-container')).toContainText('e4');
    await expect(page.locator('.move-tree-container')).toContainText('e5');
  });
});

test.describe('Reset Button', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should reset game to starting position', async ({ page }) => {
    // Make some moves
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(300);
    
    await page.locator('[data-square="e7"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e5"]').click();
    
    // Verify moves
    await expect(page.locator('.move-tree-header .move-count')).toContainText('2 / 2', { timeout: 5000 });
    
    // Click reset button
    page.on('dialog', dialog => dialog.accept()); // Accept confirmation
    await page.getByRole('button', { name: /New Game/i }).click();
    
    // Verify board is reset
    await expect(page.locator('.move-tree-header .move-count')).toContainText('0 / 0', { timeout: 5000 });
    await expect(page.locator('.turn-indicator')).toContainText(/White to move/i);
  });

  test('should show confirmation before resetting', async ({ page }) => {
    // Make a move first
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    await expect(page.locator('.move-tree-container')).toContainText('e4', { timeout: 5000 });
    
    // Click reset but cancel confirmation
    page.on('dialog', dialog => dialog.dismiss()); // Dismiss confirmation
    await page.getByRole('button', { name: /New Game/i }).click();
    
    // Game should NOT be reset
    await expect(page.locator('.move-tree-container')).toContainText('e4');
  });

  test('reset button should be visible in header', async ({ page }) => {
    const resetButton = page.getByRole('button', { name: /New Game/i });
    await expect(resetButton).toBeVisible();
  });
});

