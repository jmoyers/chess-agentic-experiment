import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents, GameState, Move, ConversationMessage, StreamChunk, BoardAnnotations, ToolCallEvent, ThinkingEvent, PauseEvent, MultipleChoiceEvent, ReasoningModeEvent, AIModelId, AIModel, PromptStyleId, SessionData, LichessDatabase, ExplorerResult, AgentSettings, ExplorerStatus, AnalysisInfo, AnalysisComplete, EngineInfo, OpeningSearchResult } from '@chess/shared';
import { useBoardStore } from './boardStore';
import { useConversationStore } from './conversationStore';
import { useExplorerStore } from './explorerStore';
import { useAnalysisStore } from './analysisStore';
import { useOpeningStore } from './openingStore';

type ChessSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Valid model IDs for initialization from URL
const VALID_MODEL_IDS: AIModelId[] = ['claude-sonnet-4', 'claude-opus-4.5', 'chatgpt-5.2', 'gemini-3-pro'];
const DEFAULT_MODEL_ID: AIModelId = 'claude-opus-4.5';

// Get initial model from URL (for HMR resilience)
function getInitialModelFromUrl(): AIModelId {
  if (typeof window === 'undefined') return DEFAULT_MODEL_ID;
  const params = new URLSearchParams(window.location.search);
  const modelParam = params.get('model');
  if (modelParam && VALID_MODEL_IDS.includes(modelParam as AIModelId)) {
    return modelParam as AIModelId;
  }
  return DEFAULT_MODEL_ID;
}

// Session ID storage key
const SESSION_STORAGE_KEY = 'chess-session-id';

function getStoredSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSessionId(sessionId: string): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Ignore storage errors
  }
}

function clearStoredSessionId(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

interface ConnectionState {
  socket: ChessSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  
  // Session state
  sessionId: string | null;
  
  // Model state
  availableModels: AIModel[];
  currentModelId: AIModelId | null;
  
  // Agent settings
  agentSettings: AgentSettings;
  
  connect: () => void;
  disconnect: () => void;
  
  // Game actions
  loadGame: (type: 'fen' | 'pgn', data: string) => void;
  loadOpening: (openingId: string) => void;
  loadOpeningByPgn: (pgn: string) => void;
  makeMove: (from: string, to: string, promotion?: string) => void;
  navigateToMove: (index: number) => void;
  resetGame: () => void;
  resetSession: () => void;
  
  // Opening search actions
  searchOpenings: (query: string) => void;
  
  // Virtual mode actions
  exitVirtualMode: () => void;
  
  // Conversation actions
  sendMessage: (conversationId: string, message: string) => void;
  createConversation: () => string | null;
  selectConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  
  // Model actions
  selectModel: (modelId: AIModelId) => void;
  fetchModels: () => void;
  
  // Explorer actions
  requestExplorer: (fen?: string, database?: LichessDatabase) => void;
  fetchExplorerStatus: () => void;
  
  // Agent settings actions
  setThinkingEnabled: (enabled: boolean) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setPromptStyle: (styleId: PromptStyleId) => void;
  fetchAgentSettings: () => void;
  
  // Continue after pause
  continueExplanation: (pauseId: string) => void;
  
  // Answer multiple choice question
  answerMultipleChoice: (questionId: string, answerIndex: number) => void;
  
  // Dismiss a prompt (pause or multiple choice)
  dismissPrompt: (promptId: string) => void;
  
  // Stop an in-flight conversation
  stopConversation: (conversationId: string) => void;
}

const connectionStoreApi = create<ConnectionState>((set, get) => ({
  socket: null,
  isConnected: false,
  isConnecting: false,
  error: null,
  sessionId: null,
  availableModels: [],
  currentModelId: getInitialModelFromUrl(),
  agentSettings: { thinking: true, webSearch: true, promptStyle: 'detailed' as PromptStyleId },
  
  connect: () => {
    const { socket, isConnecting } = get();
    // Prevent multiple connection attempts - check if socket exists OR if already connecting
    // This guards against React StrictMode double-calling the effect
    if (socket || isConnecting) return;
    
    set({ isConnecting: true, error: null });
    
    const newSocket: ChessSocket = io('http://localhost:3001', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    
    newSocket.on('connect', () => {
      // Don't set isConnected yet - wait for session to be established
      set({ isConnecting: true });
      console.log('Socket connected, establishing session...');
      
      // Try to restore existing session or create new one
      const storedSessionId = getStoredSessionId();
      if (storedSessionId) {
        console.log('Restoring session:', storedSessionId);
        newSocket.emit('session:restore', storedSessionId);
      } else {
        console.log('Creating new session');
        newSocket.emit('session:create');
      }
    });
    
    // Session handlers - only set isConnected AFTER session is established
    // This prevents race conditions where URL state sync tries to select
    // conversations before the session is ready
    newSocket.on('session:restored', (data: SessionData) => {
      console.log('Session restored:', data.sessionId);
      set({ sessionId: data.sessionId, isConnected: true, isConnecting: false });
      storeSessionId(data.sessionId);
      useBoardStore.getState().setGameState(data.gameState);
    });
    
    newSocket.on('session:created', (sessionId: string) => {
      console.log('Session created:', sessionId);
      set({ sessionId, isConnected: true, isConnecting: false });
      storeSessionId(sessionId);
    });
    
    newSocket.on('disconnect', () => {
      set({ isConnected: false });
      console.log('Disconnected from server');
    });
    
    newSocket.on('connect_error', (err) => {
      set({ isConnecting: false, error: err.message });
      console.error('Connection error:', err);
    });
    
    // Game state handlers
    newSocket.on('game:state', (state: GameState) => {
      useBoardStore.getState().setGameState(state);
    });
    
    newSocket.on('game:move', (move: Move, state: GameState) => {
      useBoardStore.getState().setGameState(state);
    });
    
    newSocket.on('game:error', (error: string) => {
      useBoardStore.getState().setError(error);
    });
    
    // Opening handlers
    newSocket.on('opening:searchResults', (results: OpeningSearchResult[]) => {
      useOpeningStore.getState().setSearchResults(results);
    });
    
    newSocket.on('opening:loaded', (opening) => {
      useOpeningStore.getState().setCurrentOpening(opening);
    });
    
    // Conversation handlers
    newSocket.on('conversation:message', (message: ConversationMessage) => {
      useConversationStore.getState().addMessage(message);
    });
    
    newSocket.on('conversation:stream', (chunk: StreamChunk) => {
      useConversationStore.getState().appendToStream(chunk);
    });
    
    newSocket.on('conversation:thinking', (data: ThinkingEvent) => {
      useConversationStore.getState().handleThinking(data);
    });
    
    newSocket.on('conversation:toolCall', (data: ToolCallEvent) => {
      useConversationStore.getState().handleToolCall(data);
    });
    
    newSocket.on('conversation:pause', (data: PauseEvent) => {
      useConversationStore.getState().handlePause(data);
    });
    
    newSocket.on('conversation:multipleChoice', (data: MultipleChoiceEvent) => {
      useConversationStore.getState().handleMultipleChoice(data);
    });
    
    newSocket.on('conversation:reasoningMode', (data: ReasoningModeEvent) => {
      useConversationStore.getState().handleReasoningMode(data);
    });
    
    newSocket.on('conversation:end', (conversationId: string) => {
      useConversationStore.getState().finalizeStream(conversationId);
      useConversationStore.getState().setThinking(false);
      useConversationStore.getState().setToolCall(null);
      useConversationStore.getState().clearToolCallHistory();
      useConversationStore.getState().clearPause();
      useConversationStore.getState().clearReasoningMode();
    });
    
    newSocket.on('conversation:interrupted', (conversationId: string) => {
      // Handle interrupted conversation - finalize what we have and clear state
      useConversationStore.getState().finalizeStream(conversationId);
      useConversationStore.getState().setThinking(false);
      useConversationStore.getState().setToolCall(null);
      useConversationStore.getState().clearToolCallHistory();
      useConversationStore.getState().clearPause();
      useConversationStore.getState().clearReasoningMode();
    });
    
    newSocket.on('conversation:error', (error: string) => {
      useConversationStore.getState().setError(error);
      useConversationStore.getState().setThinking(false);
      useConversationStore.getState().setToolCall(null);
    });
    
    // Model handlers
    newSocket.on('model:changed', (modelId: AIModelId) => {
      set({ currentModelId: modelId });
    });
    
    newSocket.on('model:list', (models: AIModel[]) => {
      set({ availableModels: models });
    });
    
    // Agent settings handler
    newSocket.on('agent:settings', (settings: AgentSettings) => {
      set({ agentSettings: settings });
    });
    
    // Board annotation handlers
    newSocket.on('board:annotations', (annotations: BoardAnnotations) => {
      useBoardStore.getState().setAnnotations(annotations);
    });
    
    newSocket.on('board:clearAnnotations', () => {
      useBoardStore.getState().clearAnnotations();
    });
    
    // Virtual mode handlers
    newSocket.on('virtual:start', (baseFen: string, baseIndex: number) => {
      useBoardStore.getState().startVirtualMode(baseFen, baseIndex);
    });
    
    newSocket.on('virtual:moves', (moves: Move[], annotations?: BoardAnnotations) => {
      useBoardStore.getState().setVirtualMoves(moves, annotations);
    });
    
    newSocket.on('virtual:end', () => {
      useBoardStore.getState().exitVirtualMode();
    });
    
    // Animation handlers
    newSocket.on('animation:start', (data) => {
      useBoardStore.getState().startAnimation(data.description, data.moves.length);
    });
    
    newSocket.on('animation:move', (data) => {
      useBoardStore.getState().setGameState(data.state);
      useBoardStore.getState().updateAnimation(data.moveIndex + 1, data.totalMoves);
    });
    
    newSocket.on('animation:complete', () => {
      useBoardStore.getState().endAnimation();
    });
    
    // Explorer handlers
    newSocket.on('explorer:result', ({ result, database }: { result: ExplorerResult; database: LichessDatabase }) => {
      const explorerStore = useExplorerStore.getState();
      if (database === 'masters') {
        explorerStore.setMastersResult(result);
      } else if (database === 'local') {
        explorerStore.setLocalResult(result);
      } else {
        explorerStore.setLichessResult(result);
      }
    });
    
    newSocket.on('explorer:error', ({ error, database }: { error: string; database: LichessDatabase }) => {
      const explorerStore = useExplorerStore.getState();
      if (database === 'masters') {
        explorerStore.setMastersError(error);
      } else if (database === 'local') {
        explorerStore.setLocalError(error);
      } else {
        explorerStore.setLichessError(error);
      }
    });
    
    newSocket.on('explorer:status', (status: ExplorerStatus) => {
      useExplorerStore.getState().setExplorerStatus(status);
    });
    
    // Analysis handlers
    newSocket.on('engine:ready', (info: EngineInfo) => {
      useAnalysisStore.getState().setEngineReady(info);
    });
    
    newSocket.on('analysis:info', (info: AnalysisInfo) => {
      useAnalysisStore.getState().handleAnalysisInfo(info);
    });
    
    newSocket.on('analysis:complete', (result: AnalysisComplete) => {
      useAnalysisStore.getState().handleAnalysisComplete(result);
    });
    
    newSocket.on('analysis:error', (error: string) => {
      useAnalysisStore.getState().handleAnalysisError(error);
    });
    
    set({ socket: newSocket });
  },
  
  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },
  
  loadGame: (type, data) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('game:load', { type, data });
    }
  },
  
  loadOpening: (openingId) => {
    const { socket, isConnected } = get();
    if (socket && isConnected) {
      // Use setTimeout to ensure socket is fully ready after state update
      setTimeout(() => {
        if (socket.connected) {
          socket.emit('game:loadOpening', openingId);
        } else {
          // If still not connected, wait for connect event
          socket.once('connect', () => {
            socket.emit('game:loadOpening', openingId);
          });
        }
      }, 0);
    }
  },
  
  loadOpeningByPgn: (pgn) => {
    const { socket, isConnected } = get();
    if (socket && isConnected) {
      setTimeout(() => {
        if (socket.connected) {
          socket.emit('game:loadOpeningByPgn', pgn);
        } else {
          socket.once('connect', () => {
            socket.emit('game:loadOpeningByPgn', pgn);
          });
        }
      }, 0);
    }
  },
  
  searchOpenings: (query) => {
    const { socket } = get();
    if (socket?.connected && query.trim()) {
      useOpeningStore.getState().setIsSearching(true);
      socket.emit('opening:search', query.trim());
    } else {
      useOpeningStore.getState().setSearchResults([]);
    }
  },
  
  makeMove: (from, to, promotion) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('game:move', { from, to, promotion: promotion as any });
    }
  },
  
  navigateToMove: (index) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('game:navigate', index);
    }
  },
  
  resetGame: () => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('game:reset');
    }
  },
  
  // Reset to a completely fresh session (new game, clears session ID)
  resetSession: () => {
    const { socket } = get();
    if (socket?.connected) {
      clearStoredSessionId();
      set({ sessionId: null });
      socket.emit('session:create');
    }
  },
  
  exitVirtualMode: () => {
    const { socket } = get();
    useBoardStore.getState().exitVirtualMode();
    if (socket?.connected) {
      socket.emit('virtual:exit');
    }
  },
  
  sendMessage: (conversationId, message) => {
    const { socket } = get();
    if (socket?.connected) {
      // Clear any active prompts when sending a new message
      const conversationStore = useConversationStore.getState();
      const { pause, multipleChoice } = conversationStore;
      
      // Dismiss any active prompt first
      if (pause.isPaused && pause.pauseId) {
        socket.emit('conversation:dismissPrompt', pause.pauseId);
      }
      if (multipleChoice.isActive && multipleChoice.questionId) {
        socket.emit('conversation:dismissPrompt', multipleChoice.questionId);
      }
      conversationStore.clearAllPrompts();
      
      conversationStore.addUserMessage(conversationId, message);
      socket.emit('conversation:send', { conversationId, message });
    }
  },
  
  createConversation: () => {
    const { socket } = get();
    if (socket?.connected) {
      // Generate a temporary ID that server will use
      const tempId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      socket.emit('conversation:create', tempId);
      return tempId;
    }
    return null;
  },
  
  selectConversation: (conversationId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('conversation:select', conversationId);
    }
  },
  
  deleteConversation: (conversationId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('conversation:delete', conversationId);
      useConversationStore.getState().removeConversation(conversationId);
    }
  },
  
  selectModel: (modelId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('model:select', modelId);
      set({ currentModelId: modelId });
    }
  },
  
  fetchModels: () => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('model:getList');
    }
  },
  
  requestExplorer: (fen, database) => {
    const { socket } = get();
    if (socket?.connected) {
      const explorerStore = useExplorerStore.getState();
      if (database) {
        // Request specific database
        if (database === 'masters') {
          explorerStore.setMastersLoading(true);
        } else if (database === 'local') {
          explorerStore.setLocalLoading(true);
        } else {
          explorerStore.setLichessLoading(true);
        }
        socket.emit('explorer:request', { fen, database });
      } else {
        // Request databases based on active source
        const activeSource = explorerStore.activeSource;
        if (activeSource === 'local' && explorerStore.localAvailable) {
          explorerStore.setLocalLoading(true);
          socket.emit('explorer:request', { fen, database: 'local' });
        } else {
          // Default: request both remote databases
          explorerStore.setMastersLoading(true);
          explorerStore.setLichessLoading(true);
          socket.emit('explorer:request', { fen, database: 'masters' });
          socket.emit('explorer:request', { fen, database: 'lichess' });
        }
      }
    }
  },
  
  fetchExplorerStatus: () => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('explorer:getStatus');
    }
  },
  
  setThinkingEnabled: (enabled) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('agent:setThinking', enabled);
      // Optimistically update local state
      set((state) => ({
        agentSettings: { ...state.agentSettings, thinking: enabled },
      }));
    }
  },
  
  setWebSearchEnabled: (enabled) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('agent:setWebSearch', enabled);
      // Optimistically update local state
      set((state) => ({
        agentSettings: { ...state.agentSettings, webSearch: enabled },
      }));
    }
  },
  
  setPromptStyle: (styleId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('agent:setPromptStyle', styleId);
      // Optimistically update local state
      set((state) => ({
        agentSettings: { ...state.agentSettings, promptStyle: styleId },
      }));
    }
  },
  
  fetchAgentSettings: () => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('agent:getSettings');
    }
  },
  
  continueExplanation: (pauseId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('conversation:continue', pauseId);
      useConversationStore.getState().clearPause();
    }
  },
  
  answerMultipleChoice: (questionId, answerIndex) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('conversation:answer', { questionId, answerIndex });
      useConversationStore.getState().clearMultipleChoice();
    }
  },
  
  dismissPrompt: (promptId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('conversation:dismissPrompt', promptId);
      useConversationStore.getState().clearAllPrompts();
    }
  },
  
  stopConversation: (conversationId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('conversation:interrupt', conversationId);
    }
  },
}));

// Export the store hook
export const useConnectionStore = connectionStoreApi;

// Expose store for E2E tests (to configure test-friendly settings)
if (typeof window !== 'undefined') {
  (window as any).__ZUSTAND_CONNECTION_STORE__ = connectionStoreApi;
}

