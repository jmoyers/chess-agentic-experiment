import { Server, Socket } from 'socket.io';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerToClientEvents, ClientToServerEvents, GameState, Move, AIModelId, PromptStyleId, SessionData, LichessDatabase, ExplorerStatus, AnalysisOptions, AnalysisInfo, AnalysisComplete, OpeningSearchResult } from '@chess/shared';
import { ChessManager } from '../chess/manager.js';
import { ConversationManager } from '../agent/conversationManager.js';
import { AgentHarness } from '../agent/harness.js';
import { getOpeningById } from '../database/openingLibrary.js';
import { getLichessOpeningLibrary } from '../database/lichess-openings/index.js';
import { getExplorer } from '../database/lichess/index.js';
import { LocalExplorer } from '../database/local-explorer/index.js';
import { agentLog } from '../utils/logger.js';
import { getStockfishService, type StockfishService } from '../engine/stockfish.js';

// Local explorer - hardcoded path relative to server directory
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_EXPLORER_PATH = join(__dirname, '..', '..', 'data', 'opening-explorer.lmdb');

// Global local explorer instance (lazily initialized)
let localExplorer: LocalExplorer | null = null;
let localExplorerStatus: ExplorerStatus = { localAvailable: false };

// Global Stockfish service instance
let stockfishService: StockfishService | null = null;
let stockfishInitializing: Promise<void> | null = null;

/**
 * Initialize the local explorer if database exists
 */
async function initLocalExplorer(): Promise<void> {
  if (existsSync(LOCAL_EXPLORER_PATH)) {
    try {
      localExplorer = new LocalExplorer(LOCAL_EXPLORER_PATH);
      await localExplorer.open();
      const stats = await localExplorer.getStats();
      localExplorerStatus = {
        localAvailable: true,
        localPositionCount: stats.positionCount,
        localGameCount: stats.moveCount, // Approximate - we don't track exact game count
      };
      console.log(`Local explorer initialized: ${stats.positionCount} positions`);
    } catch (error) {
      console.warn('Failed to initialize local explorer:', error);
      localExplorer = null;
      localExplorerStatus = { localAvailable: false };
    }
  } else {
    console.log('Local explorer database not found at:', LOCAL_EXPLORER_PATH);
    localExplorerStatus = { localAvailable: false };
  }
}

// Initialize local explorer on module load
initLocalExplorer();

/**
 * Initialize Stockfish service (lazy, on first use)
 */
async function initStockfish(): Promise<StockfishService> {
  if (stockfishService?.isReady()) {
    return stockfishService;
  }

  // Prevent multiple parallel initializations
  if (stockfishInitializing) {
    await stockfishInitializing;
    return stockfishService!;
  }

  stockfishInitializing = (async () => {
    try {
      stockfishService = getStockfishService();
      const info = await stockfishService.init();
      console.log(`Stockfish initialized: ${info.name} (NNUE: ${info.nnue})`);
    } catch (error) {
      console.error('Failed to initialize Stockfish:', error);
      stockfishService = null;
      throw error;
    }
  })();

  await stockfishInitializing;
  stockfishInitializing = null;
  return stockfishService!;
}

type SocketServer = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Session-based storage (persists across socket reconnections)
// In future, this could be backed by a database for multi-user support
interface SessionState {
  gameManager: ChessManager;
  conversationManager: ConversationManager;
  createdAt: number;
  updatedAt: number;
}

const sessions = new Map<string, SessionState>();

// Map socket ID to session ID for active connections
const socketToSession = new Map<string, string>();

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getOrCreateSession(sessionId: string): SessionState {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      gameManager: new ChessManager(),
      conversationManager: new ConversationManager(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    sessions.set(sessionId, session);
    console.log(`Created new session: ${sessionId}`);
  }
  return session;
}

function getSessionData(sessionId: string): SessionData | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  return {
    sessionId,
    gameState: session.gameManager.getState(),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function updateSessionTimestamp(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.updatedAt = Date.now();
  }
}

// Legacy helpers for backward compatibility during transition
function getOrCreateGameManager(socketId: string): ChessManager {
  const sessionId = socketToSession.get(socketId);
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) return session.gameManager;
  }
  // Fallback: create a temporary session
  const tempId = `temp-${socketId}`;
  return getOrCreateSession(tempId).gameManager;
}

function getOrCreateConversationManager(socketId: string): ConversationManager {
  const sessionId = socketToSession.get(socketId);
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) return session.conversationManager;
  }
  // Fallback: create a temporary session
  const tempId = `temp-${socketId}`;
  return getOrCreateSession(tempId).conversationManager;
}

export function setupSocketHandlers(io: SocketServer): void {
  io.on('connection', (socket: ClientSocket) => {
    console.log(`Client connected: ${socket.id}`);

    // Session will be set up when client sends session:restore or session:create
    let currentSessionId: string | null = null;
    let gameManager: ChessManager;
    let conversationManager: ConversationManager;
    let agentHarness: AgentHarness;

    // Initialize managers (will be replaced when session is established)
    const initializeForSession = (sessionId: string) => {
      currentSessionId = sessionId;
      socketToSession.set(socket.id, sessionId);
      const session = getOrCreateSession(sessionId);
      gameManager = session.gameManager;
      conversationManager = session.conversationManager;
      agentHarness = new AgentHarness(gameManager, conversationManager, socket);
    };

    // Session management events
    socket.on('session:restore', (sessionId: string) => {
      console.log(`Restoring session: ${sessionId}`);
      const existingData = getSessionData(sessionId);
      
      if (existingData) {
        initializeForSession(sessionId);
        socket.emit('session:restored', existingData);
        console.log(`Session restored: ${sessionId}`);
      } else {
        // Session not found, create new one with same ID
        initializeForSession(sessionId);
        socket.emit('session:created', sessionId);
        socket.emit('game:state', gameManager.getState());
        console.log(`Session not found, created new: ${sessionId}`);
      }
    });

    socket.on('session:create', () => {
      const newSessionId = generateSessionId();
      console.log(`Creating new session: ${newSessionId}`);
      initializeForSession(newSessionId);
      socket.emit('session:created', newSessionId);
      socket.emit('game:state', gameManager.getState());
    });

    // Initialize with a temporary session for backward compatibility
    // (clients should send session:restore or session:create immediately)
    const tempSessionId = `temp-${socket.id}`;
    initializeForSession(tempSessionId);

    // Game events
    socket.on('game:load', ({ type, data }: { type: 'fen' | 'pgn'; data: string }) => {
      try {
        if (type === 'fen') {
          gameManager.loadFEN(data);
        } else {
          gameManager.loadPGN(data);
        }
        if (currentSessionId) {
          updateSessionTimestamp(currentSessionId);
        }
        socket.emit('game:state', gameManager.getState());
      } catch (error) {
        socket.emit('game:error', error instanceof Error ? error.message : 'Failed to load game');
      }
    });

    socket.on('game:loadOpening', (openingId: string) => {
      try {
        const opening = getOpeningById(openingId);
        if (!opening) {
          socket.emit('game:error', `Opening not found: ${openingId}`);
          return;
        }
        gameManager.loadPGN(opening.moves);
        if (currentSessionId) {
          updateSessionTimestamp(currentSessionId);
        }
        socket.emit('game:state', gameManager.getState());
        // Emit opening loaded event
        socket.emit('opening:loaded', { eco: opening.eco, name: opening.name, pgn: opening.moves });
      } catch (error) {
        socket.emit('game:error', error instanceof Error ? error.message : 'Failed to load opening');
      }
    });

    // Load opening by PGN (from Lichess database search)
    socket.on('game:loadOpeningByPgn', (pgn: string) => {
      try {
        gameManager.loadPGN(pgn);
        if (currentSessionId) {
          updateSessionTimestamp(currentSessionId);
        }
        socket.emit('game:state', gameManager.getState());
        
        // Look up the opening name from the current position
        const library = getLichessOpeningLibrary();
        const opening = library.getByPosition(gameManager.getState().fen);
        if (opening) {
          socket.emit('opening:loaded', { eco: opening.eco, name: opening.name, pgn: opening.pgn });
        } else {
          socket.emit('opening:loaded', null);
        }
      } catch (error) {
        socket.emit('game:error', error instanceof Error ? error.message : 'Failed to load opening');
      }
    });

    // Search openings from Lichess database
    socket.on('opening:search', (query: string) => {
      try {
        const library = getLichessOpeningLibrary();
        const results = library.search(query, 50);
        const searchResults: OpeningSearchResult[] = results.map(o => ({
          eco: o.eco,
          name: o.name,
          pgn: o.pgn,
          uci: o.uci,
        }));
        socket.emit('opening:searchResults', searchResults);
      } catch (error) {
        console.error('Opening search error:', error);
        socket.emit('opening:searchResults', []);
      }
    });

    socket.on('game:move', (move: { from: string; to: string; promotion?: string }) => {
      try {
        const result = gameManager.makeMove(move.from, move.to, move.promotion as any);
        if (result) {
          if (currentSessionId) {
            updateSessionTimestamp(currentSessionId);
          }
          socket.emit('game:move', result, gameManager.getState());
        } else {
          socket.emit('game:error', 'Invalid move');
        }
      } catch (error) {
        socket.emit('game:error', error instanceof Error ? error.message : 'Move failed');
      }
    });

    socket.on('game:navigate', (index: number) => {
      try {
        gameManager.navigateToMove(index);
        socket.emit('game:state', gameManager.getState());
      } catch (error) {
        socket.emit('game:error', error instanceof Error ? error.message : 'Navigation failed');
      }
    });

    socket.on('game:reset', () => {
      gameManager.reset();
      if (currentSessionId) {
        updateSessionTimestamp(currentSessionId);
      }
      socket.emit('game:state', gameManager.getState());
    });

    // Conversation events
    socket.on('conversation:create', (clientId?: string) => {
      agentLog.socket('conversation:create', 'receive', { clientId });
      const conversation = conversationManager.createConversation(clientId);
      agentLog.conversation(conversation.id, 'CREATED via socket');
      agentLog.socket('conversation:message', 'emit', { type: 'system', conversationId: conversation.id });
      socket.emit('conversation:message', {
        id: `system-${conversation.id}`,
        conversationId: conversation.id,
        role: 'assistant',
        content: 'New conversation started. Ask me about openings, positions, or chess strategy.',
        timestamp: Date.now(),
      });
    });

    socket.on('conversation:send', async ({ conversationId, message }: { conversationId: string; message: string }) => {
      agentLog.socket('conversation:send', 'receive', { 
        conversationId: conversationId.slice(0, 8), 
        messageLength: message.length 
      });
      try {
        await agentHarness.processMessage(conversationId, message);
      } catch (error) {
        agentLog.error('conversation:send handler', error);
        socket.emit('conversation:error', error instanceof Error ? error.message : 'Failed to process message');
      }
    });

    socket.on('conversation:select', (conversationId: string) => {
      agentLog.socket('conversation:select', 'receive', { conversationId: conversationId.slice(0, 8) });
      const conversation = conversationManager.getConversation(conversationId);
      if (conversation) {
        agentLog.conversation(conversationId, 'SELECTED', { messageCount: conversation.messages.length });
        // Send all messages in the conversation
        for (const msg of conversation.messages) {
          socket.emit('conversation:message', msg);
        }
      } else {
        agentLog.conversation(conversationId, 'NOT FOUND on select');
      }
    });

    socket.on('conversation:delete', (conversationId: string) => {
      agentLog.socket('conversation:delete', 'receive', { conversationId: conversationId.slice(0, 8) });
      conversationManager.deleteConversation(conversationId);
      agentLog.conversation(conversationId, 'DELETED');
    });

    socket.on('conversation:interrupt', (conversationId: string) => {
      agentLog.socket('conversation:interrupt', 'receive', { conversationId: conversationId.slice(0, 8) });
      agentHarness.abortConversation(conversationId);
    });

    // Analysis events - Legacy simple request
    socket.on('analysis:request', async (depth = 20) => {
      try {
        const sf = await initStockfish();
        const fen = gameManager.getState().fen;
        const result = await sf.analyze(fen, { depth });
        
        // Convert to legacy format
        const line = result.lines[0];
        socket.emit('analysis:result', {
          fen: result.fen,
          depth: line?.depth || depth,
          score: line?.score.type === 'cp' ? line.score.value / 100 : 0,
          mate: line?.score.type === 'mate' ? line.score.value : null,
          bestMove: result.bestMove,
          pv: line?.moves || [],
          time: result.totalTime,
        });
      } catch (error) {
        console.error('Analysis error:', error);
        socket.emit('analysis:error', error instanceof Error ? error.message : 'Analysis failed');
      }
    });

    // Streaming analysis - per-socket state for event cleanup
    let analysisInfoHandler: ((info: AnalysisInfo) => void) | null = null;
    let analysisBestmoveHandler: ((result: AnalysisComplete) => void) | null = null;
    let analysisErrorHandler: ((error: Error) => void) | null = null;

    const cleanupAnalysisHandlers = () => {
      if (stockfishService) {
        if (analysisInfoHandler) {
          stockfishService.removeListener('info', analysisInfoHandler);
          analysisInfoHandler = null;
        }
        if (analysisBestmoveHandler) {
          stockfishService.removeListener('bestmove', analysisBestmoveHandler);
          analysisBestmoveHandler = null;
        }
        if (analysisErrorHandler) {
          stockfishService.removeListener('error', analysisErrorHandler);
          analysisErrorHandler = null;
        }
      }
    };

    // Start streaming analysis
    socket.on('analysis:start', async ({ fen, options }: { fen: string; options: AnalysisOptions }) => {
      try {
        const sf = await initStockfish();

        // Clean up any existing handlers from this socket
        cleanupAnalysisHandlers();

        // Set up event handlers for this socket
        analysisInfoHandler = (info: AnalysisInfo) => {
          socket.emit('analysis:info', info);
        };
        analysisBestmoveHandler = (result: AnalysisComplete) => {
          socket.emit('analysis:complete', result);
          cleanupAnalysisHandlers();
        };
        analysisErrorHandler = (error: Error) => {
          socket.emit('analysis:error', error.message);
          cleanupAnalysisHandlers();
        };

        sf.on('info', analysisInfoHandler);
        sf.on('bestmove', analysisBestmoveHandler);
        sf.on('error', analysisErrorHandler);

        // Send engine info on first analysis
        const engineInfo = sf.getEngineInfo();
        if (engineInfo) {
          socket.emit('engine:ready', {
            name: engineInfo.name,
            authors: engineInfo.authors,
            nnue: engineInfo.nnue,
          });
        }

        // Start analysis
        await sf.startAnalysis(fen, options);
      } catch (error) {
        console.error('Analysis start error:', error);
        socket.emit('analysis:error', error instanceof Error ? error.message : 'Failed to start analysis');
        cleanupAnalysisHandlers();
      }
    });

    // Stop streaming analysis
    socket.on('analysis:stop', async () => {
      try {
        if (stockfishService?.isAnalyzing()) {
          const result = await stockfishService.stopAnalysis();
          if (result) {
            socket.emit('analysis:complete', result);
          }
        }
      } catch (error) {
        console.error('Analysis stop error:', error);
        socket.emit('analysis:error', error instanceof Error ? error.message : 'Failed to stop analysis');
      } finally {
        cleanupAnalysisHandlers();
      }
    });

    // Configure analysis options (for subsequent analyses)
    socket.on('analysis:configure', async (options: Partial<AnalysisOptions>) => {
      try {
        const sf = await initStockfish();
        
        if (options.threads !== undefined) {
          await sf.setOption('Threads', options.threads);
        }
        if (options.hash !== undefined) {
          await sf.setOption('Hash', options.hash);
        }
        if (options.multiPv !== undefined) {
          await sf.setOption('MultiPV', options.multiPv);
        }
      } catch (error) {
        console.error('Analysis configure error:', error);
        socket.emit('analysis:error', error instanceof Error ? error.message : 'Failed to configure analysis');
      }
    });

    // Virtual mode events
    socket.on('virtual:exit', () => {
      // Clear any annotations when exiting virtual mode
      socket.emit('board:clearAnnotations');
    });

    // Model selection events
    socket.on('model:select', (modelId: AIModelId) => {
      agentLog.socket('model:select', 'receive', { modelId });
      agentHarness.setModel(modelId);
    });

    socket.on('model:getList', () => {
      agentLog.socket('model:getList', 'receive');
      const models = agentHarness.getAvailableModels();
      socket.emit('model:list', models);
    });

    // Agent settings events
    socket.on('agent:setThinking', (enabled: boolean) => {
      agentLog.socket('agent:setThinking', 'receive', { enabled });
      agentHarness.setThinkingEnabled(enabled);
      socket.emit('agent:settings', agentHarness.getAgentSettings());
    });

    socket.on('agent:setWebSearch', (enabled: boolean) => {
      agentLog.socket('agent:setWebSearch', 'receive', { enabled });
      agentHarness.setWebSearchEnabled(enabled);
      socket.emit('agent:settings', agentHarness.getAgentSettings());
    });

    socket.on('agent:setPromptStyle', (styleId: PromptStyleId) => {
      agentLog.socket('agent:setPromptStyle', 'receive', { styleId });
      agentHarness.setPromptStyle(styleId);
      socket.emit('agent:settings', agentHarness.getAgentSettings());
    });

    socket.on('agent:getSettings', () => {
      agentLog.socket('agent:getSettings', 'receive');
      socket.emit('agent:settings', agentHarness.getAgentSettings());
    });

    // Opening Explorer events
    socket.on('explorer:request', async ({ fen, database }: { fen?: string; database: LichessDatabase }) => {
      try {
        const positionFen = fen || gameManager.getFEN();
        
        if (database === 'local') {
          // Handle local database query
          if (!localExplorer) {
            socket.emit('explorer:error', { 
              error: 'Local database not available',
              database 
            });
            return;
          }
          
          const result = await localExplorer.query(positionFen);
          socket.emit('explorer:result', { result, database });
        } else {
          // Handle remote Lichess API query
          const explorer = getExplorer();
          
          const result = database === 'masters'
            ? await explorer.masters(positionFen)
            : await explorer.lichess(positionFen);
          
          socket.emit('explorer:result', { result, database });
        }
      } catch (error) {
        console.error('Explorer error:', error);
        socket.emit('explorer:error', { 
          error: error instanceof Error ? error.message : 'Failed to fetch explorer data',
          database 
        });
      }
    });
    
    socket.on('explorer:getStatus', () => {
      socket.emit('explorer:status', localExplorerStatus);
    });

    // Cleanup on disconnect
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      // Only remove socket-to-session mapping, keep session data for reconnection
      socketToSession.delete(socket.id);
      // Clean up analysis event handlers
      cleanupAnalysisHandlers();
      // Note: Session data persists in memory for reconnection
      // In production, consider adding session expiration/cleanup
    });
  });
}

