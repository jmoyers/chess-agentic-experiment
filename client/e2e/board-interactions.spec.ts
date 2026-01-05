import { test, expect } from './fixtures';

test.describe('Board Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test.describe('Piece Movement', () => {
    test('should highlight legal moves when clicking a piece', async ({ page }) => {
      // Click on e2 pawn (white)
      const e2Square = page.locator('.square').filter({ has: page.locator('[data-square="e2"]') });
      await e2Square.click();
      
      // Should show legal move indicators for e3 and e4
      // The squares should have legal-move classes
      await expect(page.locator('.square.legal-move-dot, .legal-move-indicator')).toBeVisible();
    });

    test('should move piece when clicking destination square', async ({ page }) => {
      // Click e2 to select the pawn
      await page.locator('[data-square="e2"]').click();
      // Wait for selection to register
      await page.waitForTimeout(200);
      
      // Click e4 to move
      await page.locator('[data-square="e4"]').click();
      
      // Move should be recorded in move tree
      await expect(page.locator('.move-tree-container')).toContainText('e4', { timeout: 5000 });
    });

    test('should show turn indicator', async ({ page }) => {
      // White to move initially
      const turnIndicator = page.locator('.turn-indicator');
      await expect(turnIndicator).toContainText(/White to move/i);
      
      // Make a move
      await page.locator('[data-square="e2"]').click();
      await page.waitForTimeout(200);
      await page.locator('[data-square="e4"]').click();
      
      // Now black to move
      await expect(turnIndicator).toContainText(/Black to move/i, { timeout: 5000 });
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should navigate moves with arrow keys', async ({ page }) => {
      // Load an opening with moves
      await page.goto('/opening/italian-game');
      await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
      await expect(page.locator('.move-tree-header .move-count')).toContainText('5 / 5', { timeout: 10000 });
      
      // Press left arrow to go back one move
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('.move-tree-header .move-count')).toContainText('4 / 5');
      
      // Press right arrow to go forward
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.move-tree-header .move-count')).toContainText('5 / 5');
      
      // Press up arrow to go to start
      await page.keyboard.press('ArrowUp');
      await expect(page.locator('.move-tree-header .move-count')).toContainText('0 / 5');
      
      // Press down arrow to go to end
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('.move-tree-header .move-count')).toContainText('5 / 5');
    });

    test('should not navigate when typing in input', async ({ page }) => {
      // Open drawer
      await page.locator('[data-testid="drawer-toggle"]').click();
      
      // Focus textarea
      const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
      await textarea.focus();
      await textarea.fill('test');
      
      // Press arrow keys - should not affect board
      await textarea.press('ArrowLeft');
      await textarea.press('ArrowRight');
      
      // Move count should still be 0
      await expect(page.locator('.move-tree-header .move-count')).toContainText('0 / 0');
    });
  });
});

test.describe('Opening Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should show opening count', async ({ page }) => {
    await expect(page.locator('.opening-count')).toContainText('openings');
  });

  test('should expand opening list when clicked', async ({ page }) => {
    // Click to expand
    await page.locator('.opening-selector-toggle').click();
    
    // Content should be visible
    await expect(page.locator('.opening-selector-content')).toBeVisible();
  });

  test('should filter openings by search', async ({ page }) => {
    // Expand selector
    await page.locator('.opening-selector-toggle').click();
    
    // Search for Italian
    await page.locator('.search-input').fill('Italian');
    
    // Should show Italian Game
    await expect(page.locator('.opening-item').filter({ hasText: 'Italian' })).toBeVisible();
  });

  test('should filter by theme', async ({ page }) => {
    // Expand selector
    await page.locator('.opening-selector-toggle').click();
    
    // Click a theme filter
    await page.locator('.theme-tag').filter({ hasText: 'attacking' }).click();
    
    // Should show openings with attacking theme
    const items = page.locator('.opening-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should load opening when clicked', async ({ page }) => {
    // Expand selector
    await page.locator('.opening-selector-toggle').click();
    
    // Click Italian Game
    await page.locator('.opening-item').filter({ hasText: 'Italian Game' }).click();
    
    // Should load the opening - check move count
    await expect(page.locator('.move-tree-header .move-count')).toContainText('5 / 5', { timeout: 10000 });
  });
});

test.describe('Move Tree', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/opening/italian-game');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    await expect(page.locator('.move-tree-header .move-count')).toContainText('5 / 5', { timeout: 10000 });
  });

  test('should display move list', async ({ page }) => {
    // Should show all moves
    await expect(page.locator('.move-tree-content')).toContainText('e4');
    await expect(page.locator('.move-tree-content')).toContainText('e5');
    await expect(page.locator('.move-tree-content')).toContainText('Nf3');
  });

  test('should navigate when clicking a move', async ({ page }) => {
    // Click on e4 (first move)
    await page.locator('.move-tree-content').getByText('e4').first().click();
    
    // Should navigate to that move
    await expect(page.locator('.move-tree-header .move-count')).toContainText('1 / 5');
  });

  test('should highlight current move', async ({ page }) => {
    // Current move should have active class
    const lastMove = page.locator('.move.active, .move-notation.active').last();
    await expect(lastMove).toBeVisible();
  });
});

test.describe('Game Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should have PGN input field', async ({ page }) => {
    const input = page.locator('.game-input input, .game-input textarea');
    await expect(input).toBeVisible();
  });

  test('should load PGN when submitted', async ({ page }) => {
    const input = page.locator('.game-input input, .game-input textarea');
    await input.fill('1. e4 e5 2. Nf3 Nc6');
    await input.press('Enter');
    
    // Should load the moves
    await expect(page.locator('.move-tree-header .move-count')).toContainText('4 / 4', { timeout: 5000 });
  });

  test('should load FEN when valid FEN entered', async ({ page }) => {
    const input = page.locator('.game-input input, .game-input textarea');
    // Standard starting position FEN
    await input.fill('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    await input.press('Enter');
    
    // Black to move after e4
    await expect(page.locator('.turn-indicator')).toContainText(/Black to move/i);
  });
});

test.describe('Connection Status', () => {
  test('should show connected status', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
  });

  test('should show connection status indicator', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    const statusIndicator = page.locator('.connection-status');
    await expect(statusIndicator).toBeVisible();
  });
});

