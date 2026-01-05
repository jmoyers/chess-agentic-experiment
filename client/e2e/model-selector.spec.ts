import { test, expect } from './fixtures';

test.describe('Model Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should show model selector in drawer header', async ({ page }) => {
    const modelSelector = page.locator('[data-testid="model-selector"]');
    await expect(modelSelector).toBeVisible();
  });

  test('should show default model (Sonnet 4)', async ({ page }) => {
    const modelSelector = page.locator('[data-testid="model-selector"]');
    await expect(modelSelector).toContainText('Sonnet 4');
  });

  test('should open dropdown when clicked', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    
    const dropdown = page.locator('[data-testid="model-dropdown"]');
    await expect(dropdown).toBeVisible();
  });

  test('should show all model options', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    
    await expect(page.locator('[data-testid="model-option-sonnet"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-option-opus"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-option-chatgpt"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-option-gemini"]')).toBeVisible();
  });

  test('should show model descriptions', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    
    await expect(page.locator('[data-testid="model-option-sonnet"]')).toContainText('Fast & efficient');
    await expect(page.locator('[data-testid="model-option-opus"]')).toContainText('Most capable');
    await expect(page.locator('[data-testid="model-option-chatgpt"]')).toContainText("OpenAI's latest");
    await expect(page.locator('[data-testid="model-option-gemini"]')).toContainText("Google's most intelligent");
  });

  test('should switch to Opus when selected', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-opus"]').click();
    
    // Model selector should now show Opus
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Opus');
  });

  test('should switch back to Sonnet when selected', async ({ page }) => {
    // First switch to Opus
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-opus"]').click();
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Opus');
    
    // Now switch back to Sonnet
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-sonnet"]').click();
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Sonnet');
  });

  test('should close dropdown after selection', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    await expect(page.locator('[data-testid="model-dropdown"]')).toBeVisible();
    
    await page.locator('[data-testid="model-option-opus"]').click();
    await expect(page.locator('[data-testid="model-dropdown"]')).not.toBeVisible();
  });

  test('should highlight selected model option', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    
    // Sonnet should be selected by default
    const sonnetOption = page.locator('[data-testid="model-option-sonnet"]');
    await expect(sonnetOption).toHaveClass(/selected/);
  });
});

test.describe('Gemini 3 Pro Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should switch to Gemini 3 Pro when selected', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-gemini"]').click();
    
    // Model selector should now show Gemini 3
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Gemini 3');
  });

  test('should highlight Gemini 3 Pro option when selected', async ({ page }) => {
    // Select Gemini 3 Pro
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-gemini"]').click();
    
    // Re-open dropdown and check highlight
    await page.locator('[data-testid="model-selector"]').click();
    const geminiOption = page.locator('[data-testid="model-option-gemini"]');
    await expect(geminiOption).toHaveClass(/selected/);
  });

  test('should restore Gemini model from URL on page load', async ({ page }) => {
    // Navigate directly to URL with Gemini model parameter
    await page.goto('/chat?model=gemini-3-pro');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Wait for URL sync effect to run (model updates async after connection)
    await page.waitForTimeout(500);
    
    // Model selector should show Gemini 3
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Gemini 3');
  });

  test('should switch between Gemini and other models', async ({ page }) => {
    // Start with Sonnet
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Sonnet 4');
    
    // Switch to Gemini 3 Pro
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-gemini"]').click();
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Gemini 3');
    
    // Switch to Opus
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-opus"]').click();
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Opus');
    
    // Switch back to Gemini 3 Pro
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-gemini"]').click();
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Gemini 3');
  });
});

test.describe('ChatGPT 5.2 Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should switch to ChatGPT 5.2 when selected', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-chatgpt"]').click();
    
    // Model selector should now show GPT 5.2
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('GPT 5.2');
  });

  test('should highlight ChatGPT 5.2 option when selected', async ({ page }) => {
    // Select ChatGPT 5.2
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-chatgpt"]').click();
    
    // Re-open dropdown and check highlight
    await page.locator('[data-testid="model-selector"]').click();
    const chatgptOption = page.locator('[data-testid="model-option-chatgpt"]');
    await expect(chatgptOption).toHaveClass(/selected/);
  });

  test('should send message with ChatGPT 5.2 selected', async ({ page }) => {
    // Select ChatGPT 5.2 first
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-chatgpt"]').click();
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('GPT 5.2');
    
    // Send a message (will create a new conversation)
    const textarea = page.getByRole('textbox', { name: 'Ask about this position...' });
    await textarea.fill('Hello from ChatGPT 5.2 test');
    await page.getByRole('button', { name: 'Send' }).click();
    
    // Should see the user message appear
    await expect(page.getByText('Hello from ChatGPT 5.2 test').first()).toBeVisible({ timeout: 5000 });
    
    // Wait for assistant response - the app should respond (or show error gracefully)
    await expect(page.locator('.message.assistant').first()).toBeVisible({ timeout: 30000 });
  });

  test('should switch between ChatGPT 5.2 and other models', async ({ page }) => {
    // Start with Sonnet
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Sonnet 4');
    
    // Switch to ChatGPT 5.2
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-chatgpt"]').click();
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('GPT 5.2');
    
    // Switch to Opus
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-opus"]').click();
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Opus');
    
    // Switch back to ChatGPT 5.2
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-chatgpt"]').click();
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('GPT 5.2');
  });
});

test.describe('Agent Drawer Resize', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should have resize handle', async ({ page }) => {
    const handle = page.locator('[data-testid="drawer-resize-handle"]');
    await expect(handle).toBeVisible();
  });

  test('should change cursor on resize handle hover', async ({ page }) => {
    const handle = page.locator('[data-testid="drawer-resize-handle"]');
    
    const cursor = await handle.evaluate(el => {
      return window.getComputedStyle(el).cursor;
    });
    
    expect(cursor).toBe('ew-resize');
  });

  test('should resize drawer when dragging', async ({ page }) => {
    const drawer = page.locator('[data-testid="agent-drawer"]');
    const initialWidth = await drawer.evaluate(el => el.getBoundingClientRect().width);
    
    const handle = page.locator('[data-testid="drawer-resize-handle"]');
    const handleBox = await handle.boundingBox();
    
    if (handleBox) {
      // Drag handle to the left to make drawer wider
      await page.mouse.move(handleBox.x, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x - 100, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
      
      const newWidth = await drawer.evaluate(el => el.getBoundingClientRect().width);
      expect(newWidth).toBeGreaterThan(initialWidth);
    }
  });

  test('should respect minimum width constraint', async ({ page }) => {
    const drawer = page.locator('[data-testid="agent-drawer"]');
    
    const handle = page.locator('[data-testid="drawer-resize-handle"]');
    const handleBox = await handle.boundingBox();
    
    if (handleBox) {
      // Try to drag to make very narrow
      await page.mouse.move(handleBox.x, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + 500, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
      
      const width = await drawer.evaluate(el => el.getBoundingClientRect().width);
      expect(width).toBeGreaterThanOrEqual(320); // min-width
    }
  });
});

test.describe('Conversation Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should have conversation toggle button', async ({ page }) => {
    const toggle = page.locator('.conversation-toggle');
    await expect(toggle).toBeVisible();
  });

  test('should show conversation selector when toggled', async ({ page }) => {
    await page.locator('.conversation-toggle').click();
    
    const selector = page.locator('.conversation-selector').first();
    await expect(selector).toBeVisible();
  });

  test('should hide conversation selector when toggled again', async ({ page }) => {
    // Open
    await page.locator('.conversation-toggle').click();
    await expect(page.locator('.conversation-selector').first()).toBeVisible();
    
    // Close
    await page.locator('.conversation-toggle').click();
    await expect(page.locator('.conversation-selector').first()).not.toBeVisible();
  });
});

test.describe('Agent Settings Toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('should show thinking toggle in dropdown', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    
    const thinkingToggle = page.locator('[data-testid="thinking-toggle"]');
    await expect(thinkingToggle).toBeVisible();
    await expect(thinkingToggle).toContainText('Extended Thinking');
  });

  test('should show web search toggle in dropdown', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    
    const webSearchToggle = page.locator('[data-testid="websearch-toggle"]');
    await expect(webSearchToggle).toBeVisible();
    await expect(webSearchToggle).toContainText('Web Search');
  });

  test('should toggle thinking on and off', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    
    const thinkingToggle = page.locator('[data-testid="thinking-toggle"]');
    const thinkingCheckbox = page.locator('[data-testid="thinking-toggle"] input[type="checkbox"]');
    
    // Initially off
    await expect(thinkingCheckbox).not.toBeChecked();
    
    // Toggle on by clicking the label (checkbox is hidden)
    await thinkingToggle.click();
    await expect(thinkingCheckbox).toBeChecked();
    
    // Toggle off
    await thinkingToggle.click();
    await expect(thinkingCheckbox).not.toBeChecked();
  });

  test('should toggle web search on and off', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    
    const webSearchToggle = page.locator('[data-testid="websearch-toggle"]');
    const webSearchCheckbox = page.locator('[data-testid="websearch-toggle"] input[type="checkbox"]');
    
    // Initially off
    await expect(webSearchCheckbox).not.toBeChecked();
    
    // Toggle on by clicking the label (checkbox is hidden)
    await webSearchToggle.click();
    await expect(webSearchCheckbox).toBeChecked();
    
    // Toggle off
    await webSearchToggle.click();
    await expect(webSearchCheckbox).not.toBeChecked();
  });

  test('should show settings indicator when features enabled', async ({ page }) => {
    // Initially no indicator
    const indicator = page.locator('.settings-indicator');
    await expect(indicator).not.toBeVisible();
    
    // Enable thinking
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="thinking-toggle"]').click();
    
    // Click elsewhere to close dropdown
    await page.locator('.drawer-header h2').click();
    
    // Indicator should now be visible
    await expect(indicator).toBeVisible();
  });

  test('should show Features section label', async ({ page }) => {
    await page.locator('[data-testid="model-selector"]').click();
    
    await expect(page.getByText('Features')).toBeVisible();
    await expect(page.getByText('Model')).toBeVisible();
  });
});

test.describe('Model and Settings URL Persistence', () => {
  test('should update URL when model is selected', async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Select Opus model
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-opus"]').click();
    
    // Wait for URL to update
    await page.waitForTimeout(300);
    
    // Check URL contains model parameter
    const url = page.url();
    expect(url).toContain('model=claude-opus-4.5');
  });

  test('should update URL when thinking is toggled', async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Open dropdown and toggle thinking on
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="thinking-toggle"]').click();
    
    // Wait for URL to update
    await page.waitForTimeout(300);
    
    // Check URL contains thinking parameter
    const url = page.url();
    expect(url).toContain('thinking=on');
  });

  test('should update URL when web search is toggled', async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Open dropdown and toggle web search on
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="websearch-toggle"]').click();
    
    // Wait for URL to update
    await page.waitForTimeout(300);
    
    // Check URL contains websearch parameter
    const url = page.url();
    expect(url).toContain('websearch=on');
  });

  test('should restore model from URL on page load', async ({ page }) => {
    // Navigate directly to URL with model parameter
    await page.goto('/chat?model=claude-opus-4.5');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Model selector should show Opus
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Opus');
  });

  test('should restore ChatGPT model from URL on page load', async ({ page }) => {
    // Navigate directly to URL with ChatGPT model parameter
    await page.goto('/chat?model=chatgpt-5.2');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Wait for URL sync effect to run (model updates async after connection)
    await page.waitForTimeout(500);
    
    // Model selector should show GPT 5.2
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('GPT 5.2');
  });

  test('should restore all settings from URL on page load', async ({ page }) => {
    // Navigate to URL with all settings
    await page.goto('/chat?model=claude-opus-4.5&thinking=on&websearch=on');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Model selector should show Opus
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Opus');
    
    // Open dropdown to check toggles
    await page.locator('[data-testid="model-selector"]').click();
    
    // Thinking should be on
    const thinkingCheckbox = page.locator('[data-testid="thinking-toggle"] input[type="checkbox"]');
    await expect(thinkingCheckbox).toBeChecked();
    
    // Web search should be on
    const webSearchCheckbox = page.locator('[data-testid="websearch-toggle"] input[type="checkbox"]');
    await expect(webSearchCheckbox).toBeChecked();
  });

  test('should persist model selection after page refresh', async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Select ChatGPT model
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="model-option-chatgpt"]').click();
    
    // Wait for URL to update
    await page.waitForTimeout(300);
    
    // Verify URL has the model
    expect(page.url()).toContain('model=chatgpt-5.2');
    
    // Refresh the page
    await page.reload();
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Model should still be ChatGPT
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('GPT 5.2');
  });

  test('should persist thinking setting after page refresh', async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Enable thinking
    await page.locator('[data-testid="model-selector"]').click();
    await page.locator('[data-testid="thinking-toggle"]').click();
    
    // Wait for URL to update
    await page.waitForTimeout(300);
    
    // Verify URL has thinking=on
    expect(page.url()).toContain('thinking=on');
    
    // Refresh the page
    await page.reload();
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Open dropdown and check thinking is still on
    await page.locator('[data-testid="model-selector"]').click();
    const thinkingCheckbox = page.locator('[data-testid="thinking-toggle"] input[type="checkbox"]');
    await expect(thinkingCheckbox).toBeChecked();
  });

  test('should handle invalid model ID in URL gracefully', async ({ page }) => {
    // Navigate to URL with invalid model
    await page.goto('/chat?model=invalid-model');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Should fall back to test default model (Sonnet 4 via fixtures)
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Sonnet 4');
  });

  test('should combine model and other URL params', async ({ page }) => {
    // Navigate to chat with model and drawer params
    await page.goto('/chat?model=claude-sonnet-4&thinking=off&websearch=on');
    await page.getByText('Connected').waitFor({ state: 'visible', timeout: 10000 });
    
    // Model selector should show Sonnet
    await expect(page.locator('[data-testid="model-selector"]')).toContainText('Sonnet');
    
    // Verify settings
    await page.locator('[data-testid="model-selector"]').click();
    
    const thinkingCheckbox = page.locator('[data-testid="thinking-toggle"] input[type="checkbox"]');
    await expect(thinkingCheckbox).not.toBeChecked();
    
    const webSearchCheckbox = page.locator('[data-testid="websearch-toggle"] input[type="checkbox"]');
    await expect(webSearchCheckbox).toBeChecked();
  });
});

