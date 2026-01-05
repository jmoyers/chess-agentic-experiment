/**
 * Playwright Test Fixtures
 * 
 * This module provides extended test fixtures that automatically set up
 * API mocking and other test utilities for all E2E tests.
 */

import { test as base, expect } from '@playwright/test';
import { setupLichessMock } from './test-utils/lichess-mock';

/**
 * Configure agent settings for tests: use cheaper model, disable expensive features.
 * This runs after connection is established to override UI defaults.
 * Respects URL parameters - if a setting is specified in the URL, it will be applied.
 */
async function configureTestAgentSettings(page: import('@playwright/test').Page): Promise<void> {
  // Wait for socket connection, then configure test settings
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const checkAndConfigure = () => {
        // Access Zustand store from window
        const connectionStore = (window as any).__ZUSTAND_CONNECTION_STORE__;
        if (connectionStore) {
          const state = connectionStore.getState();
          if (state.isConnected && state.socket?.connected) {
            // Check URL for explicit settings
            const urlParams = new URLSearchParams(window.location.search);
            const urlModel = urlParams.get('model');
            const urlThinking = urlParams.get('thinking');
            const urlWebSearch = urlParams.get('websearch');
            
            // Valid model IDs - must match AIModelId type from shared
            const validModels = ['claude-sonnet-4', 'claude-opus-4.5', 'chatgpt-5.2', 'gemini-3-pro'];
            
            // If URL specifies a valid model, apply it; otherwise use test default
            if (urlModel && validModels.includes(urlModel)) {
              state.selectModel(urlModel);
            } else {
              state.selectModel('claude-sonnet-4');
            }
            
            // If URL specifies thinking, apply it; otherwise disable for tests
            if (urlThinking === 'on') {
              state.setThinkingEnabled(true);
            } else if (urlThinking === 'off' || !urlThinking) {
              state.setThinkingEnabled(false);
            }
            
            // If URL specifies websearch, apply it; otherwise disable for tests
            if (urlWebSearch === 'on') {
              state.setWebSearchEnabled(true);
            } else if (urlWebSearch === 'off' || !urlWebSearch) {
              state.setWebSearchEnabled(false);
            }
            resolve();
            return;
          }
        }
        // Retry until connected
        setTimeout(checkAndConfigure, 50);
      };
      checkAndConfigure();
    });
  });
}

/**
 * Extended test fixture with Lichess API mocking pre-configured.
 * 
 * Use this instead of the default `test` from @playwright/test to
 * automatically mock Lichess API calls.
 * 
 * @example
 * ```ts
 * import { test, expect } from './fixtures';
 * 
 * test('my test', async ({ page }) => {
 *   await page.goto('/');
 *   // Lichess API is automatically mocked
 * });
 * ```
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Set up Lichess API mock before each test
    await setupLichessMock(page);
    
    // After page navigation, configure test-friendly agent settings
    const originalGoto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const result = await originalGoto(url, options);
      // Configure agent settings after navigation
      await configureTestAgentSettings(page);
      return result;
    };
    
    // Also wrap reload to apply settings after page refresh
    const originalReload = page.reload.bind(page);
    page.reload = async (options) => {
      const result = await originalReload(options);
      // Configure agent settings after reload
      await configureTestAgentSettings(page);
      return result;
    };
    
    // Run the test
    await use(page);
  },
});

// Re-export expect and Page type for convenience
export { expect };
export type { Page } from '@playwright/test';

