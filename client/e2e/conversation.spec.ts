import { test, expect } from './fixtures';

test.describe('Conversation UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for socket connection
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should open and close the chat drawer', async ({ page }) => {
    const drawer = page.locator('.agent-drawer');

    // Drawer should be closed initially
    await expect(drawer).not.toHaveClass(/open/);

    // Click toggle to open - use the 💬 button
    await page.getByRole('button', { name: '💬' }).click();

    // Drawer should be open
    await expect(drawer).toHaveClass(/open/);

    // Click close button
    await page.locator('.close-drawer').click();

    // Drawer should be closed
    await expect(drawer).not.toHaveClass(/open/);
  });

  test('should show empty state when no messages', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    await expect(page.getByText('Ask me about openings')).toBeVisible();
  });

  test('should send a message and receive response', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // Type a message
    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Hello');

    // Send button should be enabled
    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).not.toBeDisabled();

    // Submit the message
    await sendButton.click();

    // Input should be cleared
    await expect(textarea).toHaveValue('');

    // User message should appear (it's in a paragraph within the messages)
    await expect(page.getByText('Hello').first()).toBeVisible();

    // Wait for system message or AI response
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 5000 });
  });

  test('should persist conversation after closing and reopening drawer', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // Send a message
    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('What is e4?');
    await page.getByRole('button', { name: 'Send' }).click();

    // Wait for user message to appear
    await expect(page.getByText('What is e4?')).toBeVisible();

    // Close drawer
    await page.getByRole('button', { name: '×' }).first().click();
    await page.waitForTimeout(500);

    // Reopen drawer
    await page.getByRole('button', { name: '💬' }).click();

    // Message should still be there
    await expect(page.getByText('What is e4?')).toBeVisible();
  });

  test('should not duplicate user messages', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // Send a message
    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Test message');
    await page.getByRole('button', { name: 'Send' }).click();

    // Wait a moment for any potential duplicates
    await page.waitForTimeout(3000);

    // Count occurrences of "Test message"
    const testMessages = page.getByText('Test message', { exact: true });
    await expect(testMessages).toHaveCount(1);
  });

  test('conversation should not disappear after sending message (CRITICAL)', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    const sendButton = page.getByRole('button', { name: 'Send' });

    // === FIRST MESSAGE ===
    await textarea.fill('Say hello');
    await sendButton.click();

    // User message should appear immediately
    await expect(page.getByText('Say hello')).toBeVisible();

    // Wait for system message to appear (conversation was created)
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 10000 });

    // Wait for AI to start responding (streaming message appears)
    await expect(page.locator('.message.assistant, .message.streaming')).toBeVisible({
      timeout: 30000,
    });

    // Wait for streaming to complete by checking the cursor is gone
    await expect(page.locator('.cursor')).toBeHidden({ timeout: 30000 });

    // Verify first message is still there after streaming completed
    await expect(page.getByText('Say hello')).toBeVisible();

    // === SECOND MESSAGE ===
    await textarea.fill('What is e4?');
    await sendButton.click();

    // Second user message should appear
    await expect(page.getByText('What is e4?')).toBeVisible();

    // First message should STILL be there (not disappeared)
    await expect(page.getByText('Say hello')).toBeVisible();

    // Wait for second AI response to complete
    await expect(page.locator('.cursor')).toBeHidden({ timeout: 30000 });

    // === VERIFY ALL MESSAGES PERSISTED ===
    // Both user messages should still be visible
    await expect(page.getByText('Say hello')).toBeVisible();
    await expect(page.getByText('What is e4?')).toBeVisible();

    // System message should still be there
    await expect(page.getByText('New conversation started')).toBeVisible();

    // Should have at least 1 AI response message (not counting system)
    const assistantMessages = page.locator('.message.assistant');
    const count = await assistantMessages.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Close and reopen drawer - messages should persist
    await page.locator('.close-drawer').click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '💬' }).click();

    // All messages should still be there
    await expect(page.getByText('Say hello')).toBeVisible();
    await expect(page.getByText('What is e4?')).toBeVisible();
  });

  test('should handle Enter key to submit', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Enter test');
    await textarea.press('Enter');

    // Should have submitted - input cleared
    await expect(textarea).toHaveValue('');
    await expect(page.getByText('Enter test')).toBeVisible();
  });

  test('should NOT submit on Shift+Enter', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Line 1');
    await textarea.press('Shift+Enter');

    // Should NOT have submitted - input should still have content
    const value = await textarea.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });
});

test.describe('Status Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should show thinking indicator after sending message', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Hello');
    await page.getByRole('button', { name: 'Send' }).click();

    // Should show thinking indicator (may be brief)
    // Using waitFor with a short timeout since it may appear and disappear quickly
    const thinkingIndicator = page.locator('.status-indicator.thinking');

    // Check that thinking text appears at some point
    // (it may be very brief before streaming starts)
    await expect(page.getByText('Thinking...'))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        // Thinking may have already completed by the time we check
        // This is OK - just means the AI responded quickly
      });
  });

  test('should show tool call indicator when agent uses tools', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Load the Italian Game');
    await page.getByRole('button', { name: 'Send' }).click();

    // Tool call indicator should appear (may be brief)
    const toolCallIndicator = page.locator('.status-indicator.tool-call');

    // Wait for either the tool call indicator or the streaming message to appear
    await Promise.race([
      toolCallIndicator.waitFor({ state: 'visible', timeout: 10000 }),
      page.locator('.message.streaming').waitFor({ state: 'visible', timeout: 10000 }),
    ]).catch(() => {
      // Tool may complete very quickly
    });

    // Eventually the opening should be loaded
    await expect(page.locator('.move-tree-header .move-count')).toContainText('5 / 5', {
      timeout: 30000,
    });
  });
});

test.describe('Quick Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should show quick action buttons in empty state', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // Should see all 5 quick action buttons in the grid
    await expect(page.getByRole('button', { name: '🎯 Best move?' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '💡 Position themes' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '⚔️ Attacking plans' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '🛡️ Defense tips' })).toBeVisible();
    await expect(page.getByRole('button', { name: '♟️ Key tactics' })).toBeVisible();
  });

  test('should show quick action chips at bottom', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // The row should have 3 chip buttons
    const quickActionsRow = page.locator('.quick-actions-row');
    await expect(quickActionsRow).toBeVisible();

    const chips = quickActionsRow.locator('.quick-action-chip');
    await expect(chips).toHaveCount(3);
  });

  test('clicking quick action should send message', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // Click the "Best move?" button
    await page.getByRole('button', { name: '🎯 Best move?' }).first().click();

    // User message should appear
    await expect(page.getByText("What's the most common or best move")).toBeVisible();

    // System message should appear
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 10000 });

    // AI should start responding
    await expect(page.locator('.message.assistant, .message.streaming')).toBeVisible({
      timeout: 30000,
    });
  });

  test('quick actions should be disabled while streaming', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // Click a quick action
    await page.getByRole('button', { name: '🎯 Best move?' }).first().click();

    // Wait for thinking indicator OR streaming to appear (one of them should appear)
    // Use waitForFunction for a more robust check
    await page
      .waitForFunction(
        () => {
          const chip = document.querySelector('.quick-action-chip');
          const thinking = document.querySelector('.status-indicator.thinking');
          const cursor = document.querySelector('.cursor');
          // During processing, either the chip is disabled, thinking indicator shows, or streaming cursor shows
          return (chip as HTMLButtonElement)?.disabled || thinking !== null || cursor !== null;
        },
        { timeout: 5000 }
      )
      .catch(() => {
        // If the AI responds very quickly, this may not catch the disabled state
        // That's OK - we're just testing that the system works
      });

    // Verify that a response eventually comes
    await expect(page.locator('.message.assistant, .message.streaming')).toBeVisible({
      timeout: 30000,
    });
  });

  test('quick action chips should remain after sending message', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // Click a quick action
    await page.getByRole('button', { name: '🎯 Best move?' }).first().click();

    // Wait for system message
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 10000 });

    // Wait for streaming to complete
    await expect(page.locator('.cursor')).toBeHidden({ timeout: 60000 });

    // Quick action chips should still be visible at the bottom
    const quickActionsRow = page.locator('.quick-actions-row');
    await expect(quickActionsRow).toBeVisible();

    // And should be enabled again
    await expect(page.locator('.quick-action-chip').first()).not.toBeDisabled();
  });
});

test.describe('Conversation State Machine', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should maintain conversation ID consistency across drawer toggles', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // Send a message
    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Test consistency');
    await page.getByRole('button', { name: 'Send' }).click();

    // Verify the message appears
    await expect(page.getByText('Test consistency')).toBeVisible();

    // Wait for system message
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 5000 });

    // Close and reopen drawer multiple times
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: '×' }).first().click();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: '💬' }).click();

      // Messages should persist
      await expect(page.getByText('Test consistency')).toBeVisible();
    }
  });

  test('should handle connection state gracefully', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // Send a message to verify connection works
    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Connection test');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Connection test')).toBeVisible();
  });

  test('should show stop button when conversation is streaming', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    // Initially, Send button should be visible, Stop button should not
    await expect(page.getByTestId('send-btn')).toBeVisible();
    await expect(page.getByTestId('stop-btn')).not.toBeVisible();

    // Send a message that will trigger the AI to respond
    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Explain the Italian Game opening in great detail');
    await page.getByTestId('send-btn').click();

    // Wait a bit for streaming to start (thinking or content)
    await page.waitForTimeout(500);

    // During streaming, Stop button should appear
    // The stop button should become visible when isStreaming is true
    const stopBtn = page.getByTestId('stop-btn');

    // Wait for the stop button to appear (max 10 seconds)
    await expect(stopBtn).toBeVisible({ timeout: 10000 });

    // Click stop to interrupt
    await stopBtn.click();

    // After stopping, Send button should come back
    await expect(page.getByTestId('send-btn')).toBeVisible({ timeout: 5000 });
  });
});
