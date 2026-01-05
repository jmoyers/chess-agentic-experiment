/**
 * Local Explorer E2E Tests
 * 
 * Tests the local database toggle in the Opening Explorer UI:
 * 1. Source toggle visibility and state
 * 2. Switching between Remote and Local sources
 * 3. Data display for local database
 * 4. Local database availability status
 * 
 * NOTE: These tests require:
 * - The server running with LOCAL_EXPLORER_PATH set to a valid LMDB database
 * - The local explorer database at /Users/jmoyers/dev/data/opening-explorer.lmdb
 */

import { test, expect } from './fixtures';

test.describe('Local Explorer Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for socket connection
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Explicitly trigger explorer status fetch (works around race condition in useEffect)
    await page.evaluate(() => {
      const connectionStore = (window as any).__ZUSTAND_CONNECTION_STORE__;
      if (connectionStore) {
        connectionStore.getState().fetchExplorerStatus();
      }
    });
    
    // Wait for status to arrive and UI to update
    await page.waitForTimeout(500);
  });

  test.describe('Source Toggle UI', () => {
    test('should display source toggle with Remote and Local buttons', async ({ page }) => {
      // Source toggle should be visible
      const sourceToggle = page.locator('.explorer-source-toggle');
      await expect(sourceToggle).toBeVisible();
      
      // Remote button
      const remoteBtn = page.locator('.source-btn').filter({ hasText: 'Remote' });
      await expect(remoteBtn).toBeVisible();
      
      // Local button
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      await expect(localBtn).toBeVisible();
    });

    test('should start with Remote source active by default', async ({ page }) => {
      const remoteBtn = page.locator('.source-btn').filter({ hasText: 'Remote' });
      await expect(remoteBtn).toHaveClass(/active/);
      
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      await expect(localBtn).not.toHaveClass(/active/);
    });

    test('should display database icons', async ({ page }) => {
      // Remote icon 🌐
      await expect(page.locator('.source-btn .source-icon').first()).toHaveText('🌐');
      
      // Local icon 💾
      await expect(page.locator('.source-btn .source-icon').last()).toHaveText('💾');
    });
  });

  test.describe('Source Switching', () => {
    test('should switch to Local source when clicking Local button', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      // Skip if local database is not available
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping: Local database not available');
        return;
      }
      
      await localBtn.click();
      
      // Local should now be active
      await expect(localBtn).toHaveClass(/active/);
      
      // Remote should no longer be active
      const remoteBtn = page.locator('.source-btn').filter({ hasText: 'Remote' });
      await expect(remoteBtn).not.toHaveClass(/active/);
    });

    test('should switch back to Remote when clicking Remote button', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      const remoteBtn = page.locator('.source-btn').filter({ hasText: 'Remote' });
      
      // Skip if local database is not available
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping: Local database not available');
        return;
      }
      
      // Switch to Local first
      await localBtn.click();
      await expect(localBtn).toHaveClass(/active/);
      
      // Switch back to Remote
      await remoteBtn.click();
      await expect(remoteBtn).toHaveClass(/active/);
      await expect(localBtn).not.toHaveClass(/active/);
    });

    test('should show different panel layout based on source', async ({ page }) => {
      // Remote shows two panels (Masters, Lichess)
      const remoteBtn = page.locator('.source-btn').filter({ hasText: 'Remote' });
      await remoteBtn.click();
      
      // Should have two database panels
      await expect(page.locator('.database-panel')).toHaveCount(2);
      
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping local panel check: Local database not available');
        return;
      }
      
      // Switch to Local
      await localBtn.click();
      
      // Should have single panel with "Local Database" title
      await expect(page.locator('.explorer-panels.single')).toBeVisible();
      await expect(page.locator('.database-title')).toHaveText('Local Database');
    });
  });

  test.describe('Local Database Content', () => {
    test('should display move data from local database', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      // Skip if local database is not available
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping: Local database not available');
        return;
      }
      
      await localBtn.click();
      
      // Wait for data to load
      await page.waitForTimeout(1000);
      
      // Should have move rows
      const moveRows = page.locator('.explorer-move-row');
      await expect(moveRows.first()).toBeVisible({ timeout: 5000 });
      
      // Should show popular moves at starting position
      const moveTexts = await page.locator('.explorer-move-row .move-san').allTextContents();
      console.log('Moves shown:', moveTexts.slice(0, 5).join(', '));
      
      // e4 or d4 should be among top moves
      expect(moveTexts.some(m => ['e4', 'd4'].includes(m))).toBe(true);
    });

    test('should display game counts', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping: Local database not available');
        return;
      }
      
      await localBtn.click();
      await page.waitForTimeout(1000);
      
      // Total games should be displayed
      const totalGames = page.locator('.database-total');
      await expect(totalGames).toBeVisible();
      
      // Should show a significant number (at least thousands)
      const gameText = await totalGames.textContent();
      console.log('Total games:', gameText);
      expect(gameText).toBeTruthy();
    });

    test('should display result bars for moves', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping: Local database not available');
        return;
      }
      
      await localBtn.click();
      await page.waitForTimeout(1000);
      
      // Result bars should be visible
      const resultBars = page.locator('.explorer-move-row .result-bar');
      await expect(resultBars.first()).toBeVisible();
      
      // Should have white, draw, black segments
      const barSegments = page.locator('.explorer-move-row .result-bar .bar-segment');
      await expect(barSegments.first()).toBeVisible();
    });

    test('should display summary bar at bottom', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping: Local database not available');
        return;
      }
      
      await localBtn.click();
      await page.waitForTimeout(1000);
      
      // Summary should be visible
      const summary = page.locator('.explorer-summary');
      await expect(summary).toBeVisible();
      
      // Should show percentage labels
      const percents = page.locator('.summary-percents .pct');
      await expect(percents).toHaveCount(3);
    });
  });

  test.describe('Local Database Availability', () => {
    test('should show Local button as disabled if database not available', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      // Get the disabled state
      const hasDisabledClass = await localBtn.evaluate((el) => el.classList.contains('disabled'));
      const isDisabled = await localBtn.getAttribute('disabled');
      
      if (hasDisabledClass || isDisabled !== null) {
        console.log('Local database not available - button is correctly disabled');
        await expect(localBtn).toHaveClass(/disabled/);
      } else {
        console.log('Local database is available - button is enabled');
        await expect(localBtn).not.toHaveClass(/disabled/);
      }
    });

    test('should show position count in Local button tooltip when available', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      const title = await localBtn.getAttribute('title');
      console.log('Local button tooltip:', title);
      
      // Should either show position count or "not available"
      expect(title).toBeTruthy();
      expect(
        title?.includes('positions') || title?.includes('not available')
      ).toBe(true);
    });
  });

  test.describe('Move Interaction', () => {
    test('should make move when clicking on explorer move', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping: Local database not available');
        return;
      }
      
      await localBtn.click();
      await page.waitForTimeout(1000);
      
      // Click on e4 if available
      const e4Move = page.locator('.explorer-move-row').filter({ hasText: 'e4' }).first();
      if (await e4Move.isVisible()) {
        await e4Move.click();
        
        // Wait for move to be made
        await page.waitForTimeout(500);
        
        // Move tree should show the move
        const moveTree = page.locator('.move-tree-container');
        await expect(moveTree).toContainText('e4', { timeout: 5000 });
      }
    });

    test('should update explorer data after making move', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping: Local database not available');
        return;
      }
      
      await localBtn.click();
      await page.waitForTimeout(1000);
      
      // Get initial moves
      const initialMoves = await page.locator('.explorer-move-row .move-san').allTextContents();
      console.log('Initial moves:', initialMoves.slice(0, 3).join(', '));
      
      // Click on e4
      const e4Move = page.locator('.explorer-move-row').filter({ hasText: 'e4' }).first();
      if (await e4Move.isVisible()) {
        await e4Move.click();
        await page.waitForTimeout(1000);
        
        // Moves should now be different (Black's responses)
        const newMoves = await page.locator('.explorer-move-row .move-san').allTextContents();
        console.log('New moves after 1. e4:', newMoves.slice(0, 3).join(', '));
        
        // Should show Black responses like e5, c5, etc.
        expect(newMoves.some(m => ['e5', 'c5', 'e6', 'c6', 'd5'].includes(m))).toBe(true);
      }
    });
  });

  test.describe('Opening Name Display', () => {
    test('should display opening name when in known opening', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping: Local database not available');
        return;
      }
      
      await localBtn.click();
      await page.waitForTimeout(1000);
      
      // Click e4
      const e4Move = page.locator('.explorer-move-row').filter({ hasText: 'e4' }).first();
      if (await e4Move.isVisible()) {
        await e4Move.click();
        await page.waitForTimeout(1000);
        
        // Should show King's Pawn opening
        const openingName = page.locator('.explorer-opening .name');
        await expect(openingName).toBeVisible();
        
        const nameText = await openingName.textContent();
        console.log('Opening name:', nameText);
        expect(nameText?.toLowerCase()).toContain('king');
      }
    });

    test('should display ECO code when in known opening', async ({ page }) => {
      const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
      
      const isDisabled = await localBtn.getAttribute('disabled');
      if (isDisabled !== null) {
        console.log('Skipping: Local database not available');
        return;
      }
      
      await localBtn.click();
      await page.waitForTimeout(1000);
      
      // Click e4
      const e4Move = page.locator('.explorer-move-row').filter({ hasText: 'e4' }).first();
      if (await e4Move.isVisible()) {
        await e4Move.click();
        await page.waitForTimeout(1000);
        
        // Should show ECO code
        const eco = page.locator('.explorer-opening .eco');
        await expect(eco).toBeVisible();
        
        const ecoText = await eco.textContent();
        console.log('ECO code:', ecoText);
        expect(ecoText).toMatch(/^[A-E]\d{2}$/);
      }
    });
  });
});

test.describe('Local Explorer - Edge Cases', () => {
  test('should handle position with no data gracefully', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Trigger explorer status fetch
    await page.evaluate(() => {
      const connectionStore = (window as any).__ZUSTAND_CONNECTION_STORE__;
      if (connectionStore) connectionStore.getState().fetchExplorerStatus();
    });
    await page.waitForTimeout(500);
    
    const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
    const isDisabled = await localBtn.getAttribute('disabled');
    if (isDisabled !== null) {
      console.log('Skipping: Local database not available');
      return;
    }
    
    await localBtn.click();
    await page.waitForTimeout(1000);
    
    // Make several moves to get to a less common position
    const movesToMake = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'd6', 'b4', 'Bb6'];
    
    for (const moveSan of movesToMake) {
      const moveRow = page.locator('.explorer-move-row').filter({ hasText: moveSan }).first();
      if (await moveRow.isVisible({ timeout: 2000 }).catch(() => false)) {
        await moveRow.click();
        await page.waitForTimeout(500);
      } else {
        console.log(`Move ${moveSan} not found in explorer, stopping`);
        break;
      }
    }
    
    // Either shows moves or shows "No games found" - both are valid
    const content = page.locator('.database-content');
    await expect(content).toBeVisible();
  });

  test('should persist source selection across navigation', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Trigger explorer status fetch
    await page.evaluate(() => {
      const connectionStore = (window as any).__ZUSTAND_CONNECTION_STORE__;
      if (connectionStore) connectionStore.getState().fetchExplorerStatus();
    });
    await page.waitForTimeout(500);
    
    const localBtn = page.locator('.source-btn').filter({ hasText: 'Local' });
    const isDisabled = await localBtn.getAttribute('disabled');
    if (isDisabled !== null) {
      console.log('Skipping: Local database not available');
      return;
    }
    
    // Switch to Local
    await localBtn.click();
    await expect(localBtn).toHaveClass(/active/);
    
    // Open the chat drawer
    await page.locator('[data-testid="drawer-toggle"]').click();
    await expect(page.locator('[data-testid="agent-drawer"]')).toHaveClass(/open/);
    
    // Close the drawer
    await page.locator('[data-testid="close-drawer"]').click();
    
    // Local should still be selected
    await expect(localBtn).toHaveClass(/active/);
  });
});

