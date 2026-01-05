import { useEffect, useRef } from 'react';
import { Board } from './components/Board/Board';
import { AgentDrawer } from './components/AgentDrawer/AgentDrawer';
import { GameInput } from './components/GameInput/GameInput';
import { MoveTree } from './components/MoveTree/MoveTree';
import { OpeningSelector } from './components/OpeningSelector/OpeningSelector';
import { OpeningExplorer } from './components/OpeningExplorer/OpeningExplorer';
import { TurnIndicator } from './components/TurnIndicator/TurnIndicator';
import { AnalysisPanel } from './components/AnalysisPanel/AnalysisPanel';
import { useConnectionStore } from './stores/connectionStore';
import { useBoardStore } from './stores/boardStore';
import { useUrlStore } from './stores/urlStore';
import { useConversationStore } from './stores/conversationStore';
import { ConnectionStatus } from './components/ConnectionStatus/ConnectionStatus';
import { GameControls } from './components/GameControls/GameControls';
import sounds from './utils/sounds';

function App() {
  const connect = useConnectionStore((state) => state.connect);
  const loadOpening = useConnectionStore((state) => state.loadOpening);
  const navigateToMove = useBoardStore((state) => state.navigateToMove);
  const currentMoveIndex = useBoardStore((state) => state.currentMoveIndex);
  const history = useBoardStore((state) => state.history);
  const virtualState = useBoardStore((state) => state.virtualState);
  const navigateVirtual = useBoardStore((state) => state.navigateVirtual);
  const exitVirtualMode = useConnectionStore((state) => state.exitVirtualMode);

  // URL state
  const drawerOpen = useUrlStore((state) => state.drawerOpen);
  const drawerWidth = useUrlStore((state) => state.drawerWidth);
  const urlRoute = useUrlStore((state) => state.route);
  const urlOpeningId = useUrlStore((state) => state.openingId);
  const urlMoveIndex = useUrlStore((state) => state.moveIndex);
  const urlConversationId = useUrlStore((state) => state.conversationId);
  const setMoveIndex = useUrlStore((state) => state.setMoveIndex);
  const urlModelId = useUrlStore((state) => state.modelId);
  const urlThinking = useUrlStore((state) => state.thinking);
  const urlWebSearch = useUrlStore((state) => state.webSearch);

  // Conversation state
  const setActiveConversation = useConversationStore((state) => state.setActiveConversation);

  // Ref to prevent feedback loop between URL and move index
  const isNavigatingFromUrl = useRef(false);
  const lastPushedMoveIndex = useRef<number | null>(null);

  // Initial connection
  useEffect(() => {
    connect();

    // Unlock audio context on first user interaction
    const unlockAudio = () => {
      sounds.unlock();
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, [connect]);

  // Connection status for syncing
  const isConnected = useConnectionStore((state) => state.isConnected);

  // Sync URL state to app state (opening load)
  useEffect(() => {
    // Load opening from URL - requires connection
    if (isConnected && urlRoute === 'opening' && urlOpeningId) {
      loadOpening(urlOpeningId);
    }
  }, [isConnected, urlRoute, urlOpeningId, loadOpening]);

  // Sync move index from URL (only on popstate/initial load)
  useEffect(() => {
    // Only navigate if URL initiated this change and we haven't just pushed this value
    if (
      urlMoveIndex !== null &&
      urlMoveIndex !== currentMoveIndex &&
      urlMoveIndex !== lastPushedMoveIndex.current
    ) {
      isNavigatingFromUrl.current = true;
      navigateToMove(urlMoveIndex);
      // Reset flag after a tick to allow server response to settle
      setTimeout(() => {
        isNavigatingFromUrl.current = false;
      }, 100);
    }
  }, [urlMoveIndex, navigateToMove]); // Removed currentMoveIndex dependency to prevent loop

  // Sync move index to URL when navigating (only if not from URL)
  useEffect(() => {
    // Skip if this change was triggered by URL navigation
    if (isNavigatingFromUrl.current) {
      return;
    }

    const newIndex = currentMoveIndex > 0 ? currentMoveIndex : null;
    // Only push if different from what we last pushed
    if (newIndex !== lastPushedMoveIndex.current) {
      lastPushedMoveIndex.current = newIndex;
      setMoveIndex(newIndex);
    }
  }, [currentMoveIndex, setMoveIndex]);

  // Sync conversation ID from URL
  const selectConversation = useConnectionStore((state) => state.selectConversation);
  useEffect(() => {
    if (isConnected && urlConversationId) {
      setActiveConversation(urlConversationId);
      // Also tell the server to load this conversation
      selectConversation(urlConversationId);
    }
  }, [isConnected, urlConversationId, setActiveConversation, selectConversation]);

  // Sync model and agent settings from URL
  const selectModel = useConnectionStore((state) => state.selectModel);
  const setThinkingEnabled = useConnectionStore((state) => state.setThinkingEnabled);
  const setWebSearchEnabled = useConnectionStore((state) => state.setWebSearchEnabled);

  // Track what we've synced from URL to avoid repeated calls
  const lastSyncedUrl = useRef<{
    modelId: string | null;
    thinking: boolean | null;
    webSearch: boolean | null;
  }>({ modelId: null, thinking: null, webSearch: null });

  // Track previous connection state to detect reconnects (including HMR)
  const wasConnected = useRef(false);

  useEffect(() => {
    // Only sync when connected
    if (!isConnected) {
      wasConnected.current = false;
      return;
    }

    // Reset sync tracking on fresh connection (handles HMR and reconnects)
    // This ensures URL always takes precedence when we first connect
    const justConnected = !wasConnected.current;
    if (justConnected) {
      wasConnected.current = true;
      lastSyncedUrl.current = { modelId: null, thinking: null, webSearch: null };
    }

    // Sync model from URL if different from what we last synced
    // This ensures URL takes precedence on initial load
    if (urlModelId && urlModelId !== lastSyncedUrl.current.modelId) {
      lastSyncedUrl.current.modelId = urlModelId;
      selectModel(urlModelId);
    }

    // Sync thinking setting from URL
    if (urlThinking !== null && urlThinking !== lastSyncedUrl.current.thinking) {
      lastSyncedUrl.current.thinking = urlThinking;
      setThinkingEnabled(urlThinking);
    }

    // Sync web search setting from URL
    if (urlWebSearch !== null && urlWebSearch !== lastSyncedUrl.current.webSearch) {
      lastSyncedUrl.current.webSearch = urlWebSearch;
      setWebSearchEnabled(urlWebSearch);
    }
  }, [
    isConnected,
    urlModelId,
    urlThinking,
    urlWebSearch,
    selectModel,
    setThinkingEnabled,
    setWebSearchEnabled,
  ]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Handle Escape to exit virtual mode
      if (e.key === 'Escape' && virtualState.isActive) {
        e.preventDefault();
        exitVirtualMode();
        return;
      }

      // In virtual mode, navigate virtual moves
      if (virtualState.isActive) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (virtualState.currentVirtualIndex > 0) {
            navigateVirtual(virtualState.currentVirtualIndex - 1);
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (virtualState.currentVirtualIndex < virtualState.virtualMoves.length) {
            navigateVirtual(virtualState.currentVirtualIndex + 1);
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          navigateVirtual(0);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          navigateVirtual(virtualState.virtualMoves.length);
        }
        return;
      }

      // Normal mode navigation
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentMoveIndex > 0) {
          navigateToMove(currentMoveIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentMoveIndex < history.length) {
          navigateToMove(currentMoveIndex + 1);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateToMove(0);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateToMove(history.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentMoveIndex,
    history.length,
    navigateToMove,
    virtualState,
    navigateVirtual,
    exitVirtualMode,
  ]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Opening Study</h1>
        <div className="header-controls">
          <GameControls />
          <ConnectionStatus />
        </div>
      </header>

      <div className="app-body">
        <main
          className="app-main"
          style={{
            marginRight: drawerOpen ? `${drawerWidth}px` : '0',
            transition: 'margin-right 250ms ease',
          }}
        >
          <div className="board-section">
            <div className="analysis-column">
              <AnalysisPanel />
            </div>
            <div className="board-column">
              <TurnIndicator />
              <Board />
            </div>
            <div className="side-panel">
              <OpeningSelector />
              <OpeningExplorer />
              <MoveTree />
              <GameInput />
            </div>
          </div>
        </main>

        <AgentDrawer />
      </div>
    </div>
  );
}

export default App;
