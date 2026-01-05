import { test, expect, Page } from './fixtures';

// Helper to add highlights via the exposed store
async function addHighlights(page: Page, highlights: Array<{ square: string; color: string; type: string }>) {
  await page.evaluate((h) => {
    const store = (window as any).__BOARD_STORE__;
    if (store) {
      store.getState().addHighlights(h);
    }
  }, highlights);
  await page.waitForTimeout(100);
}

// Helper to add arrows via the exposed store
async function addArrows(page: Page, arrows: Array<{ from: string; to: string; color: string }>) {
  await page.evaluate((a) => {
    const store = (window as any).__BOARD_STORE__;
    if (store) {
      store.getState().addArrows(a);
    }
  }, arrows);
  await page.waitForTimeout(100);
}

// Helper to set both annotations
async function setAnnotations(page: Page, annotations: { arrows: Array<{ from: string; to: string; color: string }>; highlights: Array<{ square: string; color: string; type: string }> }) {
  await page.evaluate((a) => {
    const store = (window as any).__BOARD_STORE__;
    if (store) {
      store.getState().setAnnotations(a);
    }
  }, annotations);
  await page.waitForTimeout(100);
}

test.describe('Board Annotations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test.describe('Square Highlights', () => {
    test('should display highlight on specified square', async ({ page }) => {
      await addHighlights(page, [{ square: 'e4', color: 'green', type: 'key' }]);
      
      // Verify highlight element exists with correct data attribute
      const highlight = page.locator('[data-highlight-square="e4"]');
      await expect(highlight).toBeVisible({ timeout: 2000 });
      
      // Verify it has the correct classes
      await expect(highlight).toHaveClass(/square-highlight/);
      await expect(highlight).toHaveClass(/green/);
    });

    test('should display multiple highlights on different squares', async ({ page }) => {
      const testSquares = ['a1', 'h8', 'e4', 'd5'];
      
      await addHighlights(page, testSquares.map(sq => ({ square: sq, color: 'yellow', type: 'theme' })));
      
      // Check each highlight exists
      for (const square of testSquares) {
        const highlight = page.locator(`[data-highlight-square="${square}"]`);
        await expect(highlight).toBeVisible({ timeout: 2000 });
      }
    });

    test('should display different highlight colors', async ({ page }) => {
      await addHighlights(page, [
        { square: 'e4', color: 'green', type: 'defend' },
        { square: 'd5', color: 'red', type: 'attack' },
        { square: 'c6', color: 'blue', type: 'key' },
        { square: 'f3', color: 'yellow', type: 'theme' },
      ]);
      
      // Check green highlight
      const greenHighlight = page.locator('.square-highlight.green');
      await expect(greenHighlight).toBeVisible();
      
      // Check red highlight
      const redHighlight = page.locator('.square-highlight.red');
      await expect(redHighlight).toBeVisible();
      
      // Check blue highlight
      const blueHighlight = page.locator('.square-highlight.blue');
      await expect(blueHighlight).toBeVisible();
      
      // Check yellow highlight
      const yellowHighlight = page.locator('.square-highlight.yellow');
      await expect(yellowHighlight).toBeVisible();
    });

    test('should clear highlights when making a move', async ({ page }) => {
      // Add a highlight
      await addHighlights(page, [{ square: 'e4', color: 'green', type: 'key' }]);
      
      // Verify highlight exists
      await expect(page.locator('.square-highlight')).toBeVisible();
      
      // Make a move
      await page.locator('[data-square="e2"]').click();
      await page.waitForTimeout(200);
      await page.locator('[data-square="e4"]').click();
      
      // Wait for state update
      await page.waitForTimeout(500);
      
      // Highlights should be cleared
      await expect(page.locator('.square-highlight')).toHaveCount(0);
    });

    test('should align highlights with squares visually', async ({ page }) => {
      // Add highlight to e4
      await addHighlights(page, [{ square: 'e4', color: 'green', type: 'key' }]);
      
      // Get positions
      const highlight = page.locator('[data-highlight-square="e4"]');
      const square = page.locator('[data-square="e4"]');
      
      const highlightBox = await highlight.boundingBox();
      const squareBox = await square.boundingBox();
      
      expect(highlightBox).not.toBeNull();
      expect(squareBox).not.toBeNull();
      
      if (highlightBox && squareBox) {
        // Allow for some tolerance due to dynamic sizing and sub-pixel rounding
        const tolerance = 10;
        expect(Math.abs(highlightBox.x - squareBox.x)).toBeLessThan(tolerance);
        expect(Math.abs(highlightBox.y - squareBox.y)).toBeLessThan(tolerance);
      }
    });
  });

  test.describe('Board Arrows', () => {
    test('should display arrow between squares', async ({ page }) => {
      await addArrows(page, [{ from: 'e2', to: 'e4', color: 'green' }]);
      
      // Check the annotations layer exists
      const annotationsLayer = page.locator('.annotations-layer');
      await expect(annotationsLayer).toBeVisible();
      
      // Check arrow line exists (may have visibility issues with SVG)
      const arrowLine = page.locator('.arrow-line');
      await expect(arrowLine).toHaveCount(1);
    });

    test('should display multiple arrows', async ({ page }) => {
      await addArrows(page, [
        { from: 'e2', to: 'e4', color: 'green' },
        { from: 'd7', to: 'd5', color: 'red' },
        { from: 'g1', to: 'f3', color: 'blue' },
      ]);
      
      // Check arrows exist
      const arrowLines = page.locator('.arrow-line');
      await expect(arrowLines).toHaveCount(3);
    });

    test('should display arrows with different colors', async ({ page }) => {
      await addArrows(page, [
        { from: 'e2', to: 'e4', color: 'green' },
        { from: 'd7', to: 'd5', color: 'red' },
        { from: 'g1', to: 'f3', color: 'blue' },
      ]);
      
      // Check each color exists
      await expect(page.locator('.arrow-line.green')).toHaveCount(1);
      await expect(page.locator('.arrow-line.red')).toHaveCount(1);
      await expect(page.locator('.arrow-line.blue')).toHaveCount(1);
    });

    test('should clear arrows when making a move', async ({ page }) => {
      // Add arrows
      await addArrows(page, [{ from: 'e2', to: 'e4', color: 'green' }]);
      
      // Verify arrow exists
      await expect(page.locator('.arrow-line')).toHaveCount(1);
      
      // Make a move
      await page.locator('[data-square="d2"]').click();
      await page.waitForTimeout(200);
      await page.locator('[data-square="d4"]').click();
      
      // Wait for state update
      await page.waitForTimeout(500);
      
      // Arrows should be cleared
      await expect(page.locator('.arrow-line')).toHaveCount(0);
    });
  });

  test.describe('Combined Annotations', () => {
    test('should display both arrows and highlights simultaneously', async ({ page }) => {
      await setAnnotations(page, {
        arrows: [{ from: 'e2', to: 'e4', color: 'green' }],
        highlights: [{ square: 'e4', color: 'yellow', type: 'key' }],
      });
      
      // Both should exist
      await expect(page.locator('.arrow-line')).toHaveCount(1);
      await expect(page.locator('.square-highlight')).toHaveCount(1);
    });

    test('should keep annotations when navigating moves', async ({ page }) => {
      // Load an opening first
      await page.goto('/opening/italian-game');
      await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
      await expect(page.locator('.move-tree-header .move-count')).toContainText('5 / 5', { timeout: 10000 });
      
      // Add annotations at current position
      await setAnnotations(page, {
        arrows: [{ from: 'c4', to: 'f7', color: 'red' }],
        highlights: [{ square: 'f7', color: 'red', type: 'attack' }],
      });
      
      // Verify annotations exist
      await expect(page.locator('.arrow-line')).toHaveCount(1);
      await expect(page.locator('.square-highlight')).toHaveCount(1);
      
      // Navigate back one move
      await page.keyboard.press('ArrowLeft');
      
      // Wait for state update
      await page.waitForTimeout(500);
      
      // Annotations should persist during navigation (useful for agent demos)
      await expect(page.locator('.arrow-line')).toHaveCount(1);
      await expect(page.locator('.square-highlight')).toHaveCount(1);
    });

    test('should clear annotations when loading new position', async ({ page }) => {
      // Add annotations
      await setAnnotations(page, {
        arrows: [{ from: 'e2', to: 'e4', color: 'green' }],
        highlights: [{ square: 'd4', color: 'red', type: 'attack' }],
      });
      
      // Verify annotations exist
      await expect(page.locator('.arrow-line')).toHaveCount(1);
      await expect(page.locator('.square-highlight')).toHaveCount(1);
      
      // Load an opening (this changes the position)
      await page.goto('/opening/italian-game');
      await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
      await expect(page.locator('.move-tree-header .move-count')).toContainText('5 / 5', { timeout: 10000 });
      
      // Annotations should be cleared
      await expect(page.locator('.arrow-line')).toHaveCount(0);
      await expect(page.locator('.square-highlight')).toHaveCount(0);
    });
  });
});
