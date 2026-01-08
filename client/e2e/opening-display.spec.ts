/**
 * E2E tests for chess opening name display
 * 
 * Tests that the Lichess opening library correctly identifies
 * and displays opening names as moves are made.
 */

import { test, expect } from '@playwright/test';

test.describe('Opening Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for connection
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('displays "Italian Game" after 1.e4 e5 2.Nf3 Nc6 3.Bc4', async ({ page }) => {
    // Make moves for Italian Game
    // 1. e4
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(200);
    
    // 1... e5
    await page.locator('[data-square="e7"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e5"]').click();
    await page.waitForTimeout(200);
    
    // 2. Nf3
    await page.locator('[data-square="g1"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="f3"]').click();
    await page.waitForTimeout(200);
    
    // 2... Nc6
    await page.locator('[data-square="b8"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="c6"]').click();
    await page.waitForTimeout(200);
    
    // 3. Bc4
    await page.locator('[data-square="f1"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="c4"]').click();
    await page.waitForTimeout(500);
    
    // Verify "Italian Game" appears in the opening explorer
    await expect(page.locator('.explorer-opening .name')).toContainText('Italian Game', { timeout: 5000 });
    await expect(page.locator('.explorer-opening .eco')).toContainText('C50', { timeout: 5000 });
  });

  test('displays "Sicilian Defense" after 1.e4 c5', async ({ page }) => {
    // 1. e4
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(200);
    
    // 1... c5
    await page.locator('[data-square="c7"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="c5"]').click();
    await page.waitForTimeout(500);
    
    // Verify "Sicilian Defense" appears
    await expect(page.locator('.explorer-opening .name')).toContainText('Sicilian Defense', { timeout: 5000 });
    await expect(page.locator('.explorer-opening .eco')).toContainText('B20', { timeout: 5000 });
  });

  test('displays "French Defense" after 1.e4 e6', async ({ page }) => {
    // 1. e4
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(200);
    
    // 1... e6
    await page.locator('[data-square="e7"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e6"]').click();
    await page.waitForTimeout(500);
    
    // Verify "French Defense" appears
    await expect(page.locator('.explorer-opening .name')).toContainText('French Defense', { timeout: 5000 });
    await expect(page.locator('.explorer-opening .eco')).toContainText('C00', { timeout: 5000 });
  });

  test('displays "Ruy Lopez" after 1.e4 e5 2.Nf3 Nc6 3.Bb5', async ({ page }) => {
    // 1. e4
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(200);
    
    // 1... e5
    await page.locator('[data-square="e7"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e5"]').click();
    await page.waitForTimeout(200);
    
    // 2. Nf3
    await page.locator('[data-square="g1"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="f3"]').click();
    await page.waitForTimeout(200);
    
    // 2... Nc6
    await page.locator('[data-square="b8"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="c6"]').click();
    await page.waitForTimeout(200);
    
    // 3. Bb5
    await page.locator('[data-square="f1"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="b5"]').click();
    await page.waitForTimeout(500);
    
    // Verify "Ruy Lopez" appears
    await expect(page.locator('.explorer-opening .name')).toContainText('Ruy Lopez', { timeout: 5000 });
    await expect(page.locator('.explorer-opening .eco')).toContainText('C60', { timeout: 5000 });
  });

  test('displays "Queen\'s Gambit" after 1.d4 d5 2.c4', async ({ page }) => {
    // 1. d4
    await page.locator('[data-square="d2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="d4"]').click();
    await page.waitForTimeout(200);
    
    // 1... d5
    await page.locator('[data-square="d7"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="d5"]').click();
    await page.waitForTimeout(200);
    
    // 2. c4
    await page.locator('[data-square="c2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="c4"]').click();
    await page.waitForTimeout(500);
    
    // Verify "Queen's Gambit" appears
    await expect(page.locator('.explorer-opening .name')).toContainText("Queen's Gambit", { timeout: 5000 });
    await expect(page.locator('.explorer-opening .eco')).toContainText('D06', { timeout: 5000 });
  });

  test('displays "Caro-Kann Defense" after 1.e4 c6', async ({ page }) => {
    // 1. e4
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(200);
    
    // 1... c6
    await page.locator('[data-square="c7"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="c6"]').click();
    await page.waitForTimeout(500);
    
    // Verify "Caro-Kann Defense" appears
    await expect(page.locator('.explorer-opening .name')).toContainText('Caro-Kann Defense', { timeout: 5000 });
    await expect(page.locator('.explorer-opening .eco')).toContainText('B10', { timeout: 5000 });
  });

  test('updates opening name as game progresses', async ({ page }) => {
    // Start with 1.e4 - should show King's Pawn Opening
    await page.locator('[data-square="e2"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e4"]').click();
    await page.waitForTimeout(500);
    
    // After 1.e4, the opening explorer might show "King's Pawn" or similar
    // depending on the API response (masters vs lichess database)
    
    // Continue to 1... e5 - King's Pawn Game
    await page.locator('[data-square="e7"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="e5"]').click();
    await page.waitForTimeout(500);
    
    // Continue to 2. Nf3 Nc6 - should still show King's Knight or Open Game
    await page.locator('[data-square="g1"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="f3"]').click();
    await page.waitForTimeout(200);
    
    await page.locator('[data-square="b8"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="c6"]').click();
    await page.waitForTimeout(500);
    
    // At this point we should see some opening name displayed
    const openingName = page.locator('.explorer-opening .name');
    await expect(openingName).toBeVisible({ timeout: 5000 });
    
    // Now play 3. Bc4 to get Italian Game specifically
    await page.locator('[data-square="f1"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-square="c4"]').click();
    await page.waitForTimeout(500);
    
    // Should now show Italian Game
    await expect(openingName).toContainText('Italian Game', { timeout: 5000 });
  });
});


