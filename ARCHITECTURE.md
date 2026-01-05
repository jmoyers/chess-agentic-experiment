# Chess Opening Study - System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         CLIENT (React + Vite)                                        │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                                        App.tsx                                                │   │
│  │  Orchestrates UI layout, keyboard navigation, URL sync, audio unlocking                       │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                              │                                                       │
│              ┌───────────────────────────────┼───────────────────────────────┐                      │
│              ▼                               ▼                               ▼                      │
│  ┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐           │
│  │         Board           │   │      AgentDrawer        │   │      Side Panels        │           │
│  │  Interactive chessboard │   │  AI chat interface with │   │  OpeningSelector,       │           │
│  │  with drag-drop, click  │   │  streaming responses,   │   │  OpeningExplorer,       │           │
│  │  to move, annotations,  │   │  tool call indicators,  │   │  MoveTree, AnalysisPanel│           │
│  │  virtual mode preview   │   │  multiple choice Q&A    │   │  GameControls, etc.     │           │
│  └─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘           │
│              │                               │                               │                      │
│              └───────────────────────────────┼───────────────────────────────┘                      │
│                                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                                    Zustand Stores                                             │   │
│  ├──────────────────────────────────────────────────────────────────────────────────────────────┤   │
│  │  connectionStore     │ Socket.IO client, session mgmt, emits all server events               │   │
│  │  boardStore          │ FEN, PGN, history, virtual mode, annotations, animation state         │   │
│  │  conversationStore   │ Messages, streaming state, thinking indicators, tool calls            │   │
│  │  explorerStore       │ Opening explorer results (Masters, Lichess, Local DBs)                │   │
│  │  analysisStore       │ Stockfish streaming analysis, engine info, multi-PV lines             │   │
│  │  openingStore        │ Opening search results, current opening name                          │   │
│  │  urlStore            │ URL ↔ state sync for deep linking (opening, move, conversation)       │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                              │                                                       │
└──────────────────────────────────────────────│───────────────────────────────────────────────────────┘
                                               │
                                    Socket.IO (WebSocket)
                                               │
┌──────────────────────────────────────────────│───────────────────────────────────────────────────────┐
│                                              │                                                       │
│                                    SERVER (Node.js + Express)                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                              │                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                                   Socket Handlers                                             │   │
│  │  Routes 40+ socket events to managers: game:*, conversation:*, explorer:*, analysis:*         │   │
│  │  Manages per-socket session state, cleanup on disconnect                                      │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                   │                          │                          │                            │
│                   ▼                          ▼                          ▼                            │
│  ┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐           │
│  │     ChessManager        │   │   ConversationManager   │   │      AgentHarness       │           │
│  │  chess.js wrapper for   │   │  Stores conversation    │   │  Agentic loop: sends    │           │
│  │  move validation, FEN/  │   │  history per session,   │   │  prompts to AI, handles │           │
│  │  PGN loading, position  │   │  message CRUD, manages  │   │  tool calls, streams    │           │
│  │  history, tactical      │   │  multiple conversations │   │  responses back, up to  │           │
│  │  analysis helpers       │   │  per user               │   │  20 iterations/turn     │           │
│  └─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘           │
│                                                                          │                          │
│                              ┌───────────────────────────────────────────┤                          │
│                              │                                           │                          │
│                              ▼                                           ▼                          │
│  ┌──────────────────────────────────────────────┐   ┌──────────────────────────────────────────┐   │
│  │              AI Providers                     │   │                Tools (20+)               │   │
│  ├──────────────────────────────────────────────┤   ├──────────────────────────────────────────┤   │
│  │  AnthropicProvider │ Claude Sonnet/Opus      │   │  Board: reset_board, make_moves,        │   │
│  │                    │ Extended thinking mode  │   │         undo_moves, navigate_to_move    │   │
│  │  OpenAIProvider    │ ChatGPT-5.2            │   │  Visual: draw_arrows, highlight_squares │   │
│  │                    │ With web search tool   │   │  Database: get_position_stats,          │   │
│  │  GoogleProvider    │ Gemini 3 Pro           │   │           explore_continuations,        │   │
│  │                    │ Grounded search        │   │           analyze_line                  │   │
│  │─────────────────────────────────────────────│   │  Engine: analyze_position (Stockfish)   │   │
│  │  Common: streaming responses, tool calling, │   │  Teaching: ask_multiple_choice,         │   │
│  │  configurable thinking budget per phase     │   │            show_line_with_explanation   │   │
│  └──────────────────────────────────────────────┘   └──────────────────────────────────────────┘   │
│                                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                                    Database Layer                                             │   │
│  ├──────────────────────────────────────────────────────────────────────────────────────────────┤   │
│  │  OpeningLibrary      │ Static ECO opening database, lookup by ID or position                 │   │
│  │  LichessExplorer     │ REST client for Lichess API (masters/lichess DBs), rate-limited       │   │
│  │  LocalExplorer       │ LMDB-backed local position DB, Zobrist hashing, offline queries       │   │
│  │  LichessOpenings     │ 3000+ opening names mapped to positions for auto-detection            │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                                   Stockfish Engine                                            │   │
│  │  UCI protocol wrapper, streaming analysis (depth/time/nodes), multi-PV support, NNUE eval    │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                               │
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                        SHARED (@chess/shared)                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  TypeScript types for: GameState, Move, Socket events (40+ bidirectional), ConversationMessage,      │
│  BoardAnnotations, ExplorerResult, AnalysisInfo, AIModel, Tool definitions, etc.                     │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### 1. User Makes a Move

```
Board (click e2→e4) → connectionStore.makeMove() → socket.emit('game:move')
    → Socket Handler → ChessManager.makeMove() → validates with chess.js
    → socket.emit('game:move', result) → connectionStore handler
    → boardStore.setGameState() → Board re-renders
```

### 2. User Asks AI About Opening

```
AgentDrawer (type message) → connectionStore.sendMessage() → socket.emit('conversation:send')
    → Socket Handler → AgentHarness.processMessage()
    → builds system prompt with current position
    → AI Provider streams response (with tool calls)
    → Tools execute (e.g., make_moves, draw_arrows)
    → socket.emit('conversation:stream') → conversationStore.appendToStream()
    → AgentDrawer shows streaming text + tool indicators
```

### 3. Opening Explorer Query

```
OpeningExplorer (position change) → connectionStore.requestExplorer()
    → socket.emit('explorer:request', {database: 'lichess'})
    → Socket Handler → LichessExplorer.lichess(fen)
    → REST call to Lichess API → process response
    → socket.emit('explorer:result') → explorerStore.setLichessResult()
    → OpeningExplorer shows move statistics
```

## Key Design Decisions

1. **Socket.IO for real-time**: Enables streaming AI responses, live analysis updates, and instant board sync
2. **Zustand stores**: Lightweight state management with subscriptions for selective re-renders
3. **Agentic loop**: AI can call multiple tools per turn (up to 20) to research and demonstrate concepts
4. **Virtual mode**: Shows AI-suggested lines without modifying main game history
5. **URL state sync**: Deep linking to specific openings, moves, and conversations
6. **Multi-provider AI**: Swappable between Claude, GPT, Gemini with unified interface
