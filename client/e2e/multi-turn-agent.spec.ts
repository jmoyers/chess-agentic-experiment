import { test, expect } from './fixtures';

/**
 * Multi-turn agent conversation tests.
 * 
 * These tests verify that the agent can:
 * 1. Make tool calls and continue after receiving results
 * 2. Complete complex multi-step tasks
 * 3. Properly stream responses after tool use
 */

test.describe('Multi-Turn Agent Conversations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for socket connection
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should complete multi-step task: ask about current position', async ({ page }) => {
    // Open the chat drawer
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    const sendButton = page.getByRole('button', { name: 'Send' });

    // Ask about the current position - this should trigger tool use
    await textarea.fill('What is the current position on the board?');
    await sendButton.click();

    // Wait for user message to appear (use first() due to React strict mode)
    await expect(page.getByText('What is the current position on the board?').first()).toBeVisible();

    // Wait for system message to appear (conversation was created)
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 10000 });

    // Wait for AI to start responding
    await expect(page.locator('.message.assistant, .message.streaming')).toBeVisible({
      timeout: 30000,
    });

    // Wait for streaming to complete by checking the cursor is gone
    await expect(page.locator('.cursor')).toBeHidden({ timeout: 60000 });

    // The response should mention something about the position
    const assistantMessages = page.locator('.message.assistant');
    const responseText = await assistantMessages.last().textContent();
    
    // The response should mention FEN, starting position, white, or turn
    expect(responseText?.toLowerCase()).toMatch(/position|fen|starting|white|turn|board/i);
  });

  test('should load opening and explain main line continuation', async ({ page }) => {
    // Open the chat drawer
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    const sendButton = page.getByRole('button', { name: 'Send' });

    // Ask to load an opening and explain the main line - this requires multiple tool calls
    await textarea.fill('Load the Italian Game and show me what Black typically plays next');
    await sendButton.click();

    // Wait for user message to appear
    await expect(page.getByText('Load the Italian Game and show me what Black typically plays next').first()).toBeVisible();

    // Wait for system message to appear
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 10000 });

    // Should see tool call indicators (may be brief)
    // Wait for either tool call or streaming message
    await Promise.race([
      page.locator('.status-indicator.tool-call').waitFor({ state: 'visible', timeout: 15000 }),
      page.locator('.message.streaming').waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {
      // Tool may complete very quickly
    });

    // Wait for streaming to complete (increased timeout for multi-turn)
    await expect(page.locator('.cursor')).toBeHidden({ timeout: 120000 });

    // The opening should be loaded - check move tree shows moves
    await expect(page.locator('.move-tree-header .move-count')).toContainText(/\d+ \/ \d+/, {
      timeout: 10000,
    });

    // The response should mention Black's response or the opening
    const assistantMessages = page.locator('.message.assistant');
    const responseText = await assistantMessages.last().textContent();
    expect(responseText?.toLowerCase()).toMatch(/black|bishop|knight|italian|giuoco|defense/i);
  });

  test('should handle sequential questions in same conversation', async ({ page }) => {
    // Open the chat drawer
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    const sendButton = page.getByRole('button', { name: 'Send' });

    // First question - load an opening
    await textarea.fill('Load the Caro-Kann defense');
    await sendButton.click();

    // Wait for first message and system message
    await expect(page.getByText('Load the Caro-Kann defense').first()).toBeVisible();
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 10000 });

    // Wait for streaming to complete - wait for Send button to show "Send" (not "...")
    // This is the most reliable indicator that processing is complete
    await expect(sendButton).toHaveText('Send', { timeout: 120000 });
    
    // Verify we have an assistant message with actual content
    const firstAssistant = page.locator('.message.assistant').first();
    await expect(firstAssistant).toBeVisible({ timeout: 5000 });
    
    // The assistant message should have some content (not empty)
    await expect(firstAssistant.locator('.message-content')).not.toBeEmpty({ timeout: 5000 });

    // Opening should be loaded - the move tree should show moves
    await expect(page.locator('.move-tree-header .move-count')).toContainText(/[1-9]+ \/ [1-9]+/, {
      timeout: 10000,
    });
    
    // Wait a moment to ensure server state is stable
    await page.waitForTimeout(1000);

    // Second question - ask about main line
    await textarea.fill('What is the main line continuation from here?');
    await sendButton.click();

    // Wait for second message to appear
    await expect(page.getByText('What is the main line continuation from here?').first()).toBeVisible();

    // Wait for second response to complete
    await expect(sendButton).toHaveText('Send', { timeout: 120000 });

    // Both messages should still be visible
    await expect(page.getByText('Load the Caro-Kann defense').first()).toBeVisible();
    await expect(page.getByText('What is the main line continuation from here?').first()).toBeVisible();

    // Should have at least 2 assistant responses
    const assistantMessages = page.locator('.message.assistant');
    const count = await assistantMessages.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should show tool call indicators during multi-turn', async ({ page }) => {
    // Open the chat drawer
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    const sendButton = page.getByRole('button', { name: 'Send' });

    // Ask something that will definitely trigger tool calls
    await textarea.fill('What are the best moves from the starting position? Use the opening database.');
    await sendButton.click();

    // Wait for user message
    await expect(page.getByText('What are the best moves from the starting position?').first()).toBeVisible();
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 10000 });

    // Try to catch tool call indicator
    const toolIndicator = page.locator('.status-indicator.tool-call');
    
    // Either see the tool indicator or the streaming starts
    const sawToolIndicator = await Promise.race([
      toolIndicator.waitFor({ state: 'visible', timeout: 15000 }).then(() => true),
      page.locator('.message.streaming').waitFor({ state: 'visible', timeout: 15000 }).then(() => false),
    ]).catch(() => false);

    // Wait for completion
    await expect(page.locator('.cursor')).toBeHidden({ timeout: 120000 });

    // The response should contain opening move information
    const assistantMessages = page.locator('.message.assistant');
    const responseText = await assistantMessages.last().textContent();
    expect(responseText?.toLowerCase()).toMatch(/e4|d4|move|opening|play/i);
  });

  test('should handle analyze position request with engine', async ({ page }) => {
    // Open the chat drawer
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    const sendButton = page.getByRole('button', { name: 'Send' });

    // Ask for engine analysis - triggers analyze_position tool
    await textarea.fill('Analyze this position with the engine and tell me the best move');
    await sendButton.click();

    // Wait for user message
    await expect(page.getByText('Analyze this position with the engine').first()).toBeVisible();
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 10000 });

    // Wait for completion - use send button as indicator
    await expect(sendButton).toHaveText('Send', { timeout: 120000 });

    // Wait for actual assistant response (not just system message)
    // The assistant message should have substantial content
    const assistantMessages = page.locator('.message.assistant .message-content');
    
    // Wait for a message that contains analysis-related terms
    await expect(assistantMessages.last()).toContainText(/move|position|analysis|equal|e4|d4/i, { timeout: 10000 });
    
    const responseText = await assistantMessages.last().textContent();
    expect(responseText?.toLowerCase()).toMatch(/move|position|analysis|equal|e4|d4|pawn|knight|bishop/i);
  });

  test('should animate opening moves when requested', async ({ page }) => {
    // Open the chat drawer
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    const sendButton = page.getByRole('button', { name: 'Send' });

    // Ask to animate an opening
    await textarea.fill('Show me the moves of the Ruy Lopez opening');
    await sendButton.click();

    // Wait for user message
    await expect(page.getByText('Show me the moves of the Ruy Lopez').first()).toBeVisible();
    await expect(page.getByText('New conversation started')).toBeVisible({ timeout: 10000 });

    // Wait for completion - use send button as indicator
    await expect(sendButton).toHaveText('Send', { timeout: 120000 });

    // Wait for animation to complete - board should show moves
    // The move tree should update as moves are animated
    await expect(page.locator('.move-tree-header .move-count')).toContainText(/[1-9]+ \/ [1-9]+/, {
      timeout: 30000,
    });

    // Wait for actual assistant response (not just system message)
    const assistantMessages = page.locator('.message.assistant .message-content');
    
    // Wait for a message that contains opening-related terms
    await expect(assistantMessages.last()).toContainText(/ruy|lopez|spanish|bishop|knight|opening|move/i, { timeout: 10000 });
    
    const responseText = await assistantMessages.last().textContent();
    expect(responseText?.toLowerCase()).toMatch(/ruy|lopez|spanish|bishop|knight|opening|move/i);
  });
});

test.describe('Tool Call UI Feedback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should show thinking then streaming states', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Hello, can you see the board?');
    await page.getByRole('button', { name: 'Send' }).click();

    // Should see thinking indicator at some point
    const thinkingIndicator = page.locator('.status-indicator.thinking');
    
    // Try to catch the thinking state
    await expect(page.getByText('Thinking...'))
      .toBeVisible({ timeout: 10000 })
      .catch(() => {
        // Thinking may have already completed by the time we check
      });

    // Eventually should have streaming message or completed message
    await expect(page.locator('.message.assistant, .message.streaming')).toBeVisible({
      timeout: 30000,
    });

    // Wait for completion
    await expect(page.locator('.cursor')).toBeHidden({ timeout: 30000 });
  });
});

test.describe('Error Handling in Multi-Turn', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should handle invalid opening gracefully', async ({ page }) => {
    await page.getByRole('button', { name: '💬' }).click();

    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Load the Nonexistent Opening XYZ');
    await page.getByRole('button', { name: 'Send' }).click();

    // Wait for response
    await expect(page.locator('.cursor')).toBeHidden({ timeout: 60000 });

    // The AI should handle this gracefully - either explaining it doesn't exist
    // or offering alternatives
    const assistantMessages = page.locator('.message.assistant');
    await expect(assistantMessages.last()).toBeVisible();
    
    const responseText = await assistantMessages.last().textContent();
    // Should mention something about not finding, not available, or suggest alternatives
    expect(responseText?.toLowerCase()).toMatch(/not found|don't have|opening|available|sorry|unfortunately|alternative/i);
  });
});

