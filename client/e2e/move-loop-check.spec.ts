import { test, expect } from './fixtures';

test.describe('Move Loop Prevention', () => {
  test('should not freeze browser when making a move', async ({ page }) => {
    // Listen for console messages
    page.on('console', msg => {
      console.log('BROWSER:', msg.text());
    });
    
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Wait for board to be ready
    await page.waitForTimeout(500);
    
    // Make first move: e2-e4
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    
    // Verify first move worked
    await expect(page.locator('.move-tree-header .move-count')).toContainText('1 / 1', { timeout: 10000 });
    
    // Check URL has move param
    expect(page.url()).toContain('move=1');
    
    // Verify no infinite loop - page should still be responsive
    // Navigate back and forth using keyboard to test URL sync doesn't cause loop
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    
    await expect(page.locator('.move-tree-header .move-count')).toContainText('0 / 1', { timeout: 5000 });
    
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    
    await expect(page.locator('.move-tree-header .move-count')).toContainText('1 / 1', { timeout: 5000 });
    
    console.log('Move completed and navigation works without infinite loop!');
  });
  
  test('should handle URL-initiated navigation without loop', async ({ page }) => {
    // Load an opening that has multiple moves
    await page.goto('/opening/italian-game');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Wait for moves to load
    await expect(page.locator('.move-tree-header .move-count')).toContainText('5 / 5', { timeout: 30000 });
    
    // Navigate using keyboard several times - this tests the URL sync
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowLeft');
    
    // Verify we're at move 2
    await expect(page.locator('.move-tree-header .move-count')).toContainText('2 / 5', { timeout: 5000 });
    
    // URL should have move=2
    expect(page.url()).toContain('move=2');
    
    // Go back to end
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.move-tree-header .move-count')).toContainText('5 / 5', { timeout: 5000 });
    
    console.log('URL navigation completed without infinite loop!');
  });
});

