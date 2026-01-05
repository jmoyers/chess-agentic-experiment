import { test, expect, Page } from './fixtures';

/**
 * Tests for user-drawn annotations (arrows and highlights)
 * 
 * Features tested:
 * - Right-click and drag to draw arrows
 * - Right-click (no drag) to toggle square highlights
 * - Toggle behavior (drawing same arrow/highlight removes it)
 * - Preview arrow while drawing
 */

async function waitForBoard(page: Page) {
  await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);
}

// Helper to simulate right-click drag on the board
async function rightClickDrag(page: Page, fromSquare: string, toSquare: string) {
  const fromElement = page.locator(`[data-square="${fromSquare}"]`);
  const toElement = page.locator(`[data-square="${toSquare}"]`);
  
  const fromBox = await fromElement.boundingBox();
  const toBox = await toElement.boundingBox();
  
  if (!fromBox || !toBox) throw new Error('Could not find square elements');
  
  const fromX = fromBox.x + fromBox.width / 2;
  const fromY = fromBox.y + fromBox.height / 2;
  const toX = toBox.x + toBox.width / 2;
  const toY = toBox.y + toBox.height / 2;
  
  await page.mouse.move(fromX, fromY);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(50);
  await page.mouse.move(toX, toY);
  await page.waitForTimeout(50);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(100);
}

// Helper to right-click on a square (no drag)
async function rightClick(page: Page, square: string) {
  const element = page.locator(`[data-square="${square}"]`);
  const box = await element.boundingBox();
  
  if (!box) throw new Error('Could not find square element');
  
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(50);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(100);
}

test.describe('User Annotations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForBoard(page);
  });

  test('should draw an arrow by right-click and drag', async ({ page }) => {
    // Draw an arrow from e2 to e4
    await rightClickDrag(page, 'e2', 'e4');
    
    // Check that an arrow was created (SVG line element)
    // Use toHaveCount since SVG elements with pointer-events:none may not pass visibility checks
    const arrows = page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)');
    await expect(arrows).toHaveCount(1);
  });

  test('should toggle arrow off when drawing same arrow again', async ({ page }) => {
    // Draw an arrow from e2 to e4
    await rightClickDrag(page, 'e2', 'e4');
    
    // Verify arrow exists
    const arrowsAfterFirst = page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)');
    await expect(arrowsAfterFirst).toHaveCount(1);
    
    // Draw the same arrow again
    await rightClickDrag(page, 'e2', 'e4');
    
    // Verify arrow is removed
    const arrowsAfterSecond = page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)');
    await expect(arrowsAfterSecond).toHaveCount(0);
  });

  test('should highlight square on right-click (no drag)', async ({ page }) => {
    // Right-click on e4 without dragging
    await rightClick(page, 'e4');
    
    // Check that a highlight was created
    const highlight = page.locator('[data-highlight-square="e4"]');
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveClass(/green/);
  });

  test('should toggle highlight off when clicking same square', async ({ page }) => {
    // Right-click on e4
    await rightClick(page, 'e4');
    
    // Verify highlight exists
    const highlight = page.locator('[data-highlight-square="e4"]');
    await expect(highlight).toBeVisible();
    
    // Right-click on e4 again
    await rightClick(page, 'e4');
    
    // Verify highlight is removed
    await expect(highlight).not.toBeVisible();
  });

  test('should show multiple arrows simultaneously', async ({ page }) => {
    // Draw multiple arrows
    await rightClickDrag(page, 'e2', 'e4');
    await rightClickDrag(page, 'd2', 'd4');
    await rightClickDrag(page, 'g1', 'f3');
    
    // Check that all arrows exist
    const arrows = page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)');
    await expect(arrows).toHaveCount(3);
  });

  test('should show multiple highlights simultaneously', async ({ page }) => {
    // Highlight multiple squares
    await rightClick(page, 'e4');
    await rightClick(page, 'd4');
    await rightClick(page, 'c5');
    
    // Check all highlights exist
    await expect(page.locator('[data-highlight-square="e4"]')).toBeVisible();
    await expect(page.locator('[data-highlight-square="d4"]')).toBeVisible();
    await expect(page.locator('[data-highlight-square="c5"]')).toBeVisible();
  });

  test('should clear annotations when making a move', async ({ page }) => {
    // Draw an arrow
    await rightClickDrag(page, 'e2', 'e4');
    
    // Highlight a square
    await rightClick(page, 'd4');
    
    // Verify annotations exist
    await expect(page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)')).toHaveCount(1);
    await expect(page.locator('[data-highlight-square="d4"]')).toBeVisible();
    
    // Make a move (e2-e4 using click-to-move)
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(100);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(300);
    
    // Verify annotations are cleared
    const arrows = page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)');
    await expect(arrows).toHaveCount(0);
    
    // Note: highlights layer may not render at all when empty
  });

  test('should not show context menu on right-click', async ({ page }) => {
    // Right-click should not trigger native context menu
    const square = page.locator('[data-square="e2"]');
    
    // Listen for any context menu event that wasn't prevented
    let contextMenuShown = false;
    await page.evaluate(() => {
      document.addEventListener('contextmenu', (e) => {
        if (!e.defaultPrevented) {
          (window as unknown as { __contextMenuShown: boolean }).__contextMenuShown = true;
        }
      }, { once: true });
    });
    
    await square.click({ button: 'right' });
    
    contextMenuShown = await page.evaluate(() => 
      (window as unknown as { __contextMenuShown: boolean }).__contextMenuShown || false
    );
    
    expect(contextMenuShown).toBe(false);
  });

  test('should clear user annotations when pressing Escape', async ({ page }) => {
    // Draw an arrow
    await rightClickDrag(page, 'e2', 'e4');
    
    // Highlight a square
    await rightClick(page, 'd4');
    
    // Verify annotations exist
    await expect(page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)')).toHaveCount(1);
    await expect(page.locator('[data-highlight-square="d4"]')).toBeVisible();
    
    // Press Escape to clear
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    
    // Verify annotations are cleared
    await expect(page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)')).toHaveCount(0);
    await expect(page.locator('[data-highlight-square="d4"]')).not.toBeVisible();
  });

  test('should clear user annotations on left-click', async ({ page }) => {
    // Draw an arrow
    await rightClickDrag(page, 'e2', 'e4');
    
    // Highlight a square
    await rightClick(page, 'd4');
    
    // Verify annotations exist
    await expect(page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)')).toHaveCount(1);
    await expect(page.locator('[data-highlight-square="d4"]')).toBeVisible();
    
    // Left-click on any square to clear
    await page.locator('[data-square="a1"]').click();
    await page.waitForTimeout(100);
    
    // Verify user annotations are cleared
    await expect(page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)')).toHaveCount(0);
    await expect(page.locator('[data-highlight-square="d4"]')).not.toBeVisible();
  });

  test('should keep annotations during navigation', async ({ page }) => {
    // Draw an arrow and highlight
    await rightClickDrag(page, 'e2', 'e4');
    await rightClick(page, 'd4');
    
    // Verify annotations exist
    await expect(page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)')).toHaveCount(1);
    await expect(page.locator('[data-highlight-square="d4"]')).toBeVisible();
    
    // Make a move first to have history
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(100);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(300);
    
    // Draw new annotations
    await rightClickDrag(page, 'd7', 'd5');
    await rightClick(page, 'c5');
    
    // Verify new annotations exist
    await expect(page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)')).toHaveCount(1);
    await expect(page.locator('[data-highlight-square="c5"]')).toBeVisible();
    
    // Navigate back (ArrowLeft)
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    
    // Annotations should persist during navigation
    await expect(page.locator('.annotations-svg line.arrow-line:not(.drawing-preview)')).toHaveCount(1);
    await expect(page.locator('[data-highlight-square="c5"]')).toBeVisible();
  });
});

