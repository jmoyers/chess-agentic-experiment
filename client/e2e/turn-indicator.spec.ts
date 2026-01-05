import { test, expect } from './fixtures';

test.describe('Turn Indicator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for socket connection
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should show "White to move" at starting position', async ({ page }) => {
    const turnIndicator = page.locator('.turn-indicator');
    await expect(turnIndicator).toBeVisible();
    await expect(turnIndicator).toContainText('White to move');
  });

  test('should show white king piece icon at starting position', async ({ page }) => {
    const turnPiece = page.locator('.turn-piece');
    await expect(turnPiece).toBeVisible();
    await expect(turnPiece).toHaveClass(/white/);
  });

  test('should update to "Black to move" after white plays via agent', async ({ page }) => {
    // Use the agent to make a move - more reliable than clicking
    await page.getByRole('button', { name: '💬' }).click();
    
    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    const sendButton = page.getByRole('button', { name: 'Send' });
    
    await textarea.fill('Make the move e4');
    await sendButton.click();
    
    // Wait for AI response to complete
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.cursor')).toBeHidden({ timeout: 30000 });
    
    // Give time for the move to be processed
    await page.waitForTimeout(1000);
    
    // Check turn indicator - should be black's turn after e4
    const turnIndicator = page.locator('.turn-indicator');
    await expect(turnIndicator).toContainText('Black to move');
    
    // King icon should be black
    const turnPiece = page.locator('.turn-piece');
    await expect(turnPiece).toHaveClass(/black/);
  });

  test('should update turn after loading an opening', async ({ page }) => {
    // Open the opening selector
    await page.locator('button:has-text("Opening Explorer")').click();
    await page.waitForTimeout(300);

    // Find and click on Italian Game
    const italianGame = page.getByText('Italian Game').first();
    await expect(italianGame).toBeVisible();
    await italianGame.click();

    // Wait for opening to load
    await page.waitForTimeout(1000);

    // The Italian Game has 4 moves (1.e4 e5 2.Nf3 Nc6 3.Bc4), black to move
    const turnIndicator = page.locator('.turn-indicator');
    await expect(turnIndicator).toContainText('Black to move');
  });

  test('should show turn indicator when navigating history via keyboard', async ({ page }) => {
    // First load an opening to have moves in history
    await page.locator('button:has-text("Opening Explorer")').click();
    await page.waitForTimeout(300);
    await page.getByText('Italian Game').first().click();
    await page.waitForTimeout(500);
    
    const turnIndicator = page.locator('.turn-indicator');
    
    // Navigate back with arrow key
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    
    // Should show White to move (after undoing black's last move)
    await expect(turnIndicator).toContainText('White to move');
    
    // Navigate forward
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    
    // Should show Black to move again
    await expect(turnIndicator).toContainText('Black to move');
  });
});

test.describe('Move Tree', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should show move counter at 0/0 initially', async ({ page }) => {
    const moveCounter = page.locator('.move-tree-header .move-count');
    await expect(moveCounter).toBeVisible();
    await expect(moveCounter).toContainText('0 / 0');
  });

  test('should update move counter after loading opening', async ({ page }) => {
    // Load Italian Game
    await page.locator('button:has-text("Opening Explorer")').click();
    await page.waitForTimeout(300);
    await page.getByText('Italian Game').first().click();
    await page.waitForTimeout(500);

    const moveCounter = page.locator('.move-tree-header .move-count');
    // Italian Game: 1.e4 e5 2.Nf3 Nc6 3.Bc4 = 5 moves
    const countText = await moveCounter.textContent();
    expect(countText).toMatch(/\d+ \/ \d+/);
    // Should be at the last move position
    const match = countText?.match(/(\d+) \/ (\d+)/);
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      expect(total).toBeGreaterThan(0);
      expect(current).toBe(total); // Should be at the end
    }
  });

  test('should display moves in the move list after loading opening', async ({ page }) => {
    // Load Sicilian Defense
    await page.locator('button:has-text("Opening Explorer")').click();
    await page.waitForTimeout(300);
    await page.getByText('Sicilian Defense').first().click();
    await page.waitForTimeout(500);

    // Check that moves appear in the move tree
    const moveTree = page.locator('.move-tree-container');
    // Sicilian starts with 1.e4 c5
    await expect(moveTree.locator('.move-san').first()).toBeVisible();
  });

  test('should navigate when clicking on Start', async ({ page }) => {
    // Load an opening first
    await page.locator('button:has-text("Opening Explorer")').click();
    await page.waitForTimeout(300);
    await page.getByText('Italian Game').first().click();
    await page.waitForTimeout(500);
    
    // Move counter should show moves played
    const moveCounter = page.locator('.move-tree-header .move-count');
    let countText = await moveCounter.textContent();
    const match = countText?.match(/(\d+) \/ (\d+)/);
    expect(match).toBeTruthy();
    const totalMoves = match ? parseInt(match[2], 10) : 0;
    expect(totalMoves).toBeGreaterThan(0);

    // Click on "Start" to go back to beginning
    await page.locator('.move-tree-item.start').click();
    await page.waitForTimeout(300);

    // Should be back at starting position (white to move)
    const turnIndicator = page.locator('.turn-indicator');
    await expect(turnIndicator).toContainText('White to move');

    // Move counter should show 0 / X
    countText = await moveCounter.textContent();
    expect(countText).toMatch(/0 \/ \d+/);
  });

  test('should highlight current move in tree', async ({ page }) => {
    // Load an opening
    await page.locator('button:has-text("Opening Explorer")').click();
    await page.waitForTimeout(300);
    await page.getByText('Italian Game').first().click();
    await page.waitForTimeout(500);
    
    // The current move should have 'current' class
    const currentMove = page.locator('.move-san.current');
    await expect(currentMove).toBeVisible();
    
    // Navigate back
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    
    // A different move should now be current
    await expect(currentMove).toBeVisible();
  });
});

test.describe('Opening Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should show opening count in explorer button', async ({ page }) => {
    const explorerButton = page.locator('button:has-text("Opening Explorer")');
    await expect(explorerButton).toBeVisible();
    await expect(explorerButton).toContainText('openings');
  });

  test('should expand to show openings when clicked', async ({ page }) => {
    await page.locator('button:has-text("Opening Explorer")').click();
    await page.waitForTimeout(300);
    
    // Should see opening names
    await expect(page.getByText('Italian Game')).toBeVisible();
    await expect(page.getByText('Sicilian Defense')).toBeVisible();
  });

  test('should load opening when clicked', async ({ page }) => {
    await page.locator('button:has-text("Opening Explorer")').click();
    await page.waitForTimeout(300);
    
    // Click on Caro-Kann
    await page.getByText('Caro-Kann Defense').first().click();
    await page.waitForTimeout(500);
    
    // Move tree should show moves
    const moveTree = page.locator('.move-tree-container');
    await expect(moveTree.locator('.move-san')).not.toHaveCount(0);
    
    // Turn indicator should show whose move it is
    const turnIndicator = page.locator('.turn-indicator');
    await expect(turnIndicator).toContainText('to move');
  });
});
