/**
 * URL State Store
 * 
 * Syncs UI state with URL for deep linking and persistence.
 * 
 * Routes:
 * - /                    - Default view (drawer closed)
 * - /chat                - Chat drawer open
 * - /chat/:conversationId - Chat with specific conversation
 * - /opening/:openingId  - Specific opening loaded
 * 
 * Query params:
 * - move=N               - Navigate to move N
 * - drawer=open|closed   - Drawer state (for non-chat routes)
 * - model=<modelId>      - Selected AI model
 * - thinking=on|off      - Extended thinking enabled
 * - websearch=on|off     - Web search enabled
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AIModelId } from '@chess/shared';

export interface UrlState {
  // Parsed from URL
  route: 'home' | 'chat' | 'opening';
  conversationId: string | null;
  openingId: string | null;
  moveIndex: number | null;
  drawerOpen: boolean;
  drawerWidth: number;
  
  // Model and agent settings from URL
  modelId: AIModelId | null;
  thinking: boolean | null;
  webSearch: boolean | null;
  
  // Actions
  setRoute: (route: UrlState['route'], params?: { conversationId?: string; openingId?: string }) => void;
  setMoveIndex: (index: number | null) => void;
  setDrawerOpen: (open: boolean) => void;
  setDrawerWidth: (width: number) => void;
  toggleDrawer: () => void;
  
  // Model and settings actions
  setModelId: (modelId: AIModelId | null) => void;
  setThinking: (enabled: boolean | null) => void;
  setWebSearch: (enabled: boolean | null) => void;
  
  // URL sync
  syncFromUrl: () => void;
  pushState: () => void;
}

// Valid model IDs for type checking - must match AIModelId type from shared
const VALID_MODEL_IDS: AIModelId[] = ['claude-sonnet-4', 'claude-opus-4.5', 'chatgpt-5.2', 'gemini-3-pro'];

function isValidModelId(value: string | null): value is AIModelId {
  return value !== null && VALID_MODEL_IDS.includes(value as AIModelId);
}

// Parse current URL into state
function parseUrl(): Partial<UrlState> {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  
  const moveParam = params.get('move');
  const drawerParam = params.get('drawer');
  const widthParam = params.get('width');
  const modelParam = params.get('model');
  const thinkingParam = params.get('thinking');
  const webSearchParam = params.get('websearch');
  
  // Parse path
  const segments = path.split('/').filter(Boolean);
  
  let route: UrlState['route'] = 'home';
  let conversationId: string | null = null;
  let openingId: string | null = null;
  let drawerOpen = false;
  
  if (segments[0] === 'chat') {
    route = 'chat';
    conversationId = segments[1] || null;
    drawerOpen = true;
  } else if (segments[0] === 'opening') {
    route = 'opening';
    openingId = segments[1] || null;
  }
  
  // Override drawer state from param if specified
  if (drawerParam === 'open') drawerOpen = true;
  if (drawerParam === 'closed') drawerOpen = false;
  
  // Parse model and settings
  const modelId = isValidModelId(modelParam) ? modelParam : null;
  const thinking = thinkingParam === 'on' ? true : thinkingParam === 'off' ? false : null;
  const webSearch = webSearchParam === 'on' ? true : webSearchParam === 'off' ? false : null;
  
  return {
    route,
    conversationId,
    openingId,
    moveIndex: moveParam ? parseInt(moveParam, 10) : null,
    drawerOpen,
    drawerWidth: widthParam ? parseInt(widthParam, 10) : 400,
    modelId,
    thinking,
    webSearch,
  };
}

// Build URL from state
function buildUrl(state: UrlState): string {
  let path = '/';
  const params = new URLSearchParams();
  
  if (state.route === 'chat') {
    path = state.conversationId ? `/chat/${state.conversationId}` : '/chat';
  } else if (state.route === 'opening' && state.openingId) {
    path = `/opening/${state.openingId}`;
  }
  
  // Add move index if present
  if (state.moveIndex !== null && state.moveIndex > 0) {
    params.set('move', state.moveIndex.toString());
  }
  
  // Add drawer state for non-chat routes
  if (state.route !== 'chat') {
    if (state.drawerOpen) {
      params.set('drawer', 'open');
    }
  }
  
  // Persist drawer width if non-default
  if (state.drawerWidth !== 400) {
    params.set('width', state.drawerWidth.toString());
  }
  
  // Add model if specified
  if (state.modelId) {
    params.set('model', state.modelId);
  }
  
  // Add thinking setting if specified
  if (state.thinking !== null) {
    params.set('thinking', state.thinking ? 'on' : 'off');
  }
  
  // Add web search setting if specified
  if (state.webSearch !== null) {
    params.set('websearch', state.webSearch ? 'on' : 'off');
  }
  
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

// Load persisted state from localStorage
function loadPersistedState(): Partial<UrlState> {
  try {
    const stored = localStorage.getItem('chess-ui-state');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        drawerWidth: parsed.drawerWidth || 400,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

// Persist state to localStorage
function persistState(state: Partial<UrlState>) {
  try {
    const toStore = {
      drawerWidth: state.drawerWidth,
    };
    localStorage.setItem('chess-ui-state', JSON.stringify(toStore));
  } catch {
    // Ignore storage errors
  }
}

export const useUrlStore = create<UrlState>()(
  subscribeWithSelector((set, get) => {
    const urlState = parseUrl();
    const persistedState = loadPersistedState();
    
    return {
      route: urlState.route || 'home',
      conversationId: urlState.conversationId || null,
      openingId: urlState.openingId || null,
      moveIndex: urlState.moveIndex || null,
      drawerOpen: urlState.drawerOpen || false,
      drawerWidth: persistedState.drawerWidth || urlState.drawerWidth || 400,
      modelId: urlState.modelId || null,
      thinking: urlState.thinking ?? null,
      webSearch: urlState.webSearch ?? null,
      
      setRoute: (route, params) => {
        set({
          route,
          conversationId: params?.conversationId || null,
          openingId: params?.openingId || null,
          drawerOpen: route === 'chat',
        });
        get().pushState();
      },
      
      setMoveIndex: (index) => {
        set({ moveIndex: index });
        get().pushState();
      },
      
      setDrawerOpen: (open) => {
        const state = get();
        set({ drawerOpen: open });
        
        // When opening drawer, switch to chat route
        if (open && state.route !== 'chat') {
          set({ route: 'chat' });
        }
        // When closing from chat route with no conversation, go home
        if (!open && state.route === 'chat') {
          set({ route: 'home' });
        }
        
        get().pushState();
      },
      
      setDrawerWidth: (width) => {
        set({ drawerWidth: width });
        persistState({ drawerWidth: width });
      },
      
      toggleDrawer: () => {
        const state = get();
        state.setDrawerOpen(!state.drawerOpen);
      },
      
      setModelId: (modelId) => {
        set({ modelId });
        get().pushState();
      },
      
      setThinking: (enabled) => {
        set({ thinking: enabled });
        get().pushState();
      },
      
      setWebSearch: (enabled) => {
        set({ webSearch: enabled });
        get().pushState();
      },
      
      syncFromUrl: () => {
        const urlState = parseUrl();
        set({
          route: urlState.route || 'home',
          conversationId: urlState.conversationId || null,
          openingId: urlState.openingId || null,
          moveIndex: urlState.moveIndex || null,
          drawerOpen: urlState.drawerOpen || false,
          modelId: urlState.modelId || null,
          thinking: urlState.thinking ?? null,
          webSearch: urlState.webSearch ?? null,
        });
      },
      
      pushState: () => {
        const state = get();
        const url = buildUrl(state);
        if (window.location.pathname + window.location.search !== url) {
          window.history.pushState({}, '', url);
        }
      },
    };
  })
);

// Listen for browser back/forward navigation
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    useUrlStore.getState().syncFromUrl();
  });
}

