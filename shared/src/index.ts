// Chess Types
export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export interface Square {
  file: string;
  rank: number;
}

export interface Move {
  from: string;
  to: string;
  promotion?: PieceType;
  san?: string;
  piece?: PieceType;
  captured?: PieceType;
  flags?: string;
}

export interface GameState {
  fen: string;
  pgn: string;
  history: Move[];
  currentMoveIndex: number;
  turn: PieceColor;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isGameOver: boolean;
}

export interface Position {
  fen: string;
  board: (Piece | null)[][];
  turn: PieceColor;
  castling: {
    whiteKingside: boolean;
    whiteQueenside: boolean;
    blackKingside: boolean;
    blackQueenside: boolean;
  };
  enPassant: string | null;
  halfMoves: number;
  fullMoves: number;
}

// Session Types (for multi-user/persistence support)
export interface SessionData {
  sessionId: string;
  gameState: GameState;
  createdAt: number;
  updatedAt: number;
}

// Socket Events
export interface ServerToClientEvents {
  'session:restored': (data: SessionData) => void;
  'session:created': (sessionId: string) => void;
  'game:state': (state: GameState) => void;
  'game:move': (move: Move, state: GameState) => void;
  'game:error': (error: string) => void;
  'conversation:message': (message: ConversationMessage) => void;
  'conversation:stream': (chunk: StreamChunk) => void;
  'conversation:thinking': (data: ThinkingEvent) => void;
  'conversation:reasoningMode': (data: ReasoningModeEvent) => void;
  'conversation:toolCall': (data: ToolCallEvent) => void;
  'conversation:pause': (data: PauseEvent) => void;
  'conversation:multipleChoice': (data: MultipleChoiceEvent) => void;
  'conversation:interrupted': (conversationId: string) => void;
  'conversation:end': (conversationId: string) => void;
  'conversation:error': (error: string) => void;
  'analysis:result': (analysis: AnalysisResult) => void;
  'analysis:info': (info: AnalysisInfo) => void;
  'analysis:complete': (result: AnalysisComplete) => void;
  'analysis:error': (error: string) => void;
  'engine:ready': (info: EngineInfo) => void;
  'board:annotations': (annotations: BoardAnnotations) => void;
  'board:clearAnnotations': () => void;
  'virtual:start': (baseFen: string, baseIndex: number) => void;
  'virtual:moves': (moves: Move[], annotations?: BoardAnnotations) => void;
  'virtual:end': () => void;
  'opening:tree': (tree: OpeningTreeNode) => void;
  'opening:searchResults': (results: OpeningSearchResult[]) => void;
  'opening:loaded': (opening: { eco: string; name: string; pgn: string } | null) => void;
  'animation:start': (data: AnimationStartData) => void;
  'animation:move': (data: AnimationMoveData) => void;
  'animation:complete': (data: AnimationCompleteData) => void;
  'model:changed': (modelId: AIModelId) => void;
  'model:list': (models: AIModel[]) => void;
  'prompt:changed': (promptStyleId: PromptStyleId) => void;
  'prompt:list': (styles: PromptStyle[]) => void;
  'explorer:result': (data: { result: ExplorerResult; database: LichessDatabase }) => void;
  'explorer:error': (data: { error: string; database: LichessDatabase }) => void;
  'explorer:status': (status: ExplorerStatus) => void;
  'agent:settings': (settings: AgentSettings) => void;
}

/** Explorer database availability status */
export interface ExplorerStatus {
  localAvailable: boolean;
  localPositionCount?: number;
  localGameCount?: number;
}

// Tool Call Event
export interface ToolCallEvent {
  conversationId: string;
  toolName: string;
  status: 'calling' | 'complete';
  args?: Record<string, unknown>;
  result?: unknown;
}

// Thinking Event
export interface ThinkingEvent {
  conversationId: string;
  content: string;
  done: boolean;
}

// Reasoning Mode Types
export type ReasoningPhase = 'planning' | 'executing';

export interface ReasoningModeEvent {
  conversationId: string;
  phase: ReasoningPhase;
  iteration: number;
  budgetTokens: number;
  maxIterations: number;
}

// Pause Event - agent wants user to continue when ready
export interface PauseEvent {
  conversationId: string;
  pauseId: string;
  message?: string; // Optional hint like "Ready to see the next concept?"
}

// Multiple Choice Event - agent asks a question with options
export interface MultipleChoiceEvent {
  conversationId: string;
  questionId: string;
  question: string;
  options: string[];
}

// Model Selection
export type AIModelId = 'claude-sonnet-4' | 'claude-opus-4.5' | 'chatgpt-5.2' | 'gemini-3-pro';

export interface AIModel {
  id: AIModelId;
  name: string;
  description: string;
  apiModel: string;
}

// Prompt Style Selection
export type PromptStyleId = 'detailed' | 'terse';

export interface PromptStyle {
  id: PromptStyleId;
  name: string;
  description: string;
}

// Animation Types
export interface AnimationStartData {
  moves: string[];
  delayMs: number;
  description?: string;
  startFen: string;
}

export interface AnimationMoveData {
  moveIndex: number;
  totalMoves: number;
  san: string;
  state: GameState;
}

export interface AnimationCompleteData {
  movesPlayed: number;
  totalMoves: number;
}

export interface AgentSettings {
  thinking: boolean;
  webSearch: boolean;
  promptStyle: PromptStyleId;
}

/** Opening search result from Lichess database */
export interface OpeningSearchResult {
  eco: string;
  name: string;
  pgn: string;
  uci: string;
}

export interface ClientToServerEvents {
  'session:restore': (sessionId: string) => void;
  'session:create': () => void;
  'game:load': (input: { type: 'fen' | 'pgn'; data: string }) => void;
  'game:loadOpening': (openingId: string) => void;
  'game:loadOpeningByPgn': (pgn: string) => void;
  'game:move': (move: { from: string; to: string; promotion?: PieceType }) => void;
  'game:navigate': (index: number) => void;
  'game:reset': () => void;
  'conversation:send': (payload: { conversationId: string; message: string }) => void;
  'conversation:continue': (pauseId: string) => void;
  'conversation:interrupt': (conversationId: string) => void;
  'conversation:answer': (payload: { questionId: string; answerIndex: number }) => void;
  'conversation:dismissPrompt': (promptId: string) => void;
  'conversation:create': (conversationId?: string) => void;
  'conversation:select': (conversationId: string) => void;
  'conversation:delete': (conversationId: string) => void;
  'analysis:request': (depth?: number) => void;
  'analysis:start': (data: { fen: string; options: AnalysisOptions }) => void;
  'analysis:stop': () => void;
  'analysis:configure': (options: Partial<AnalysisOptions>) => void;
  'opening:list': () => void;
  'opening:getTree': (openingId: string) => void;
  'opening:search': (query: string) => void;
  'virtual:exit': () => void;
  'model:select': (modelId: AIModelId) => void;
  'model:getList': () => void;
  'explorer:request': (options: { fen?: string; database: LichessDatabase }) => void;
  'explorer:getStatus': () => void;
  'agent:setThinking': (enabled: boolean) => void;
  'agent:setWebSearch': (enabled: boolean) => void;
  'agent:setPromptStyle': (styleId: PromptStyleId) => void;
  'agent:getSettings': () => void;
}

// Conversation Types
export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface StreamChunk {
  conversationId: string;
  messageId: string;
  content: string;
  done: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessage[];
  gameState?: GameState;
}

// AI Types
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  items?:
    | ToolParameter
    | { type: string; properties?: Record<string, ToolParameter>; required?: string[] };
}

// Analysis Types

/** Simple analysis result (used by agent tool) */
export interface AnalysisResult {
  fen: string;
  depth: number;
  score: number;
  mate: number | null;
  bestMove: string;
  pv: string[];
  time: number;
}

// =============================================================================
// Streaming Analysis Types (for analysis UI component)
// =============================================================================

/** Score from engine analysis */
export interface EngineScore {
  /** Score type: centipawns or mate */
  type: 'cp' | 'mate';
  /** Value: centipawns (divide by 100 for pawns) or moves to mate */
  value: number;
}

/** A single line of analysis (principal variation) */
export interface AnalysisLine {
  /** Line number (1-based, for MultiPV) */
  pv: number;
  /** Search depth reached */
  depth: number;
  /** Selective search depth */
  seldepth: number;
  /** Evaluation score */
  score: EngineScore;
  /** Nodes searched */
  nodes: number;
  /** Nodes per second */
  nps: number;
  /** Time spent in ms */
  time: number;
  /** Principal variation moves (UCI format) */
  moves: string[];
  /** Principal variation in SAN format (optional) */
  movesSan?: string[];
}

/** Streaming analysis info (emitted during search) */
export interface AnalysisInfo {
  /** Position being analyzed */
  fen: string;
  /** All lines at current depth */
  lines: AnalysisLine[];
  /** Highest completed depth across all lines */
  currentDepth: number;
  /** Hash table usage (0-1000, permill) */
  hashfull: number;
  /** Time elapsed since analysis start (ms) */
  elapsed: number;
}

/** Final analysis result (when search completes) */
export interface AnalysisComplete {
  /** Position analyzed */
  fen: string;
  /** Best move in UCI format */
  bestMove: string;
  /** Expected opponent reply (ponder move) */
  ponder?: string;
  /** Final analysis lines */
  lines: AnalysisLine[];
  /** Total analysis time in ms */
  totalTime: number;
}

/** Analysis options for configuring engine */
export interface AnalysisOptions {
  /** Maximum search depth (e.g., 20-40) */
  depth?: number;
  /** Time limit in milliseconds */
  movetime?: number;
  /** Node limit for consistent analysis */
  nodes?: number;
  /** Run until explicitly stopped */
  infinite?: boolean;
  /** Number of principal variations (1-5, default 1) */
  multiPv?: number;
  /** Number of CPU threads */
  threads?: number;
  /** Hash table size in MB */
  hash?: number;
  /** Restrict search to these moves */
  searchMoves?: string[];
}

/** Engine information */
export interface EngineInfo {
  /** Engine name (e.g., "Stockfish 17.1") */
  name: string;
  /** Author information */
  authors: string;
  /** NNUE evaluation enabled */
  nnue: boolean;
}

// Opening Database Types
export interface OpeningInfo {
  eco: string;
  name: string;
  moves: string;
  fen: string;
}

export interface OpeningStats {
  white: number;
  draws: number;
  black: number;
  total: number;
  topMoves: OpeningMove[];
}

export interface OpeningMove {
  san: string;
  uci: string;
  white: number;
  draws: number;
  black: number;
  averageRating: number;
  games: number;
}

// Opening Tree Types
export interface OpeningLine {
  id: string;
  name: string;
  eco: string;
  moves: string;
  fen: string;
  description?: string;
  themes?: string[];
  variations?: OpeningVariation[];
}

export interface OpeningVariation {
  id: string;
  name: string;
  moves: string;
  fen: string;
  description?: string;
  response?: string;
}

export interface OpeningTreeNode {
  san: string;
  fen: string;
  children: OpeningTreeNode[];
  stats?: {
    white: number;
    draws: number;
    black: number;
    games: number;
  };
  comment?: string;
  isMainLine?: boolean;
}

// Board Annotation Types
export type ArrowColor = 'green' | 'red' | 'blue' | 'yellow' | 'orange' | 'purple';
export type HighlightColor = 'green' | 'red' | 'blue' | 'yellow' | 'orange' | 'purple';
export type HighlightType = 'attack' | 'defend' | 'key' | 'weak' | 'theme' | 'custom';

export interface BoardArrow {
  from: string;
  to: string;
  color: ArrowColor;
  label?: string;
}

export interface SquareHighlight {
  square: string;
  color: HighlightColor;
  type: HighlightType;
  label?: string;
}

export interface BoardAnnotations {
  arrows: BoardArrow[];
  highlights: SquareHighlight[];
}

// Virtual Board / Analysis Mode Types
export interface VirtualBoardState {
  isActive: boolean;
  baseFen: string;
  baseIndex: number;
  virtualMoves: Move[];
  currentVirtualIndex: number;
  annotations: BoardAnnotations;
}

export interface MoveTreeNode {
  id: string;
  move: Move;
  fen: string;
  children: MoveTreeNode[];
  parent?: string;
  isVirtual?: boolean;
  comment?: string;
  annotations?: BoardAnnotations;
}

// =============================================================================
// Lichess Opening Explorer Types
// =============================================================================

/** Database source for opening explorer queries */
export type LichessDatabase = 'masters' | 'lichess' | 'player' | 'local';

/** Time control speeds for filtering */
export type LichessSpeed =
  | 'ultraBullet'
  | 'bullet'
  | 'blitz'
  | 'rapid'
  | 'classical'
  | 'correspondence';

/** Rating range buckets for filtering */
export type LichessRating = 400 | 1000 | 1200 | 1400 | 1600 | 1800 | 2000 | 2200 | 2500;

/** Move from the explorer response */
export interface LichessExplorerMove {
  /** Move in UCI notation (e.g., "e2e4") */
  uci: string;
  /** Move in SAN notation (e.g., "e4") */
  san: string;
  /** Average rating of players who played this move */
  averageRating: number;
  /** Number of games where White won after this move */
  white: number;
  /** Number of draws after this move */
  draws: number;
  /** Number of games where Black won after this move */
  black: number;
  /** Opening name if this move leads to a named opening */
  opening?: LichessOpeningInfo;
}

/** Opening information */
export interface LichessOpeningInfo {
  /** ECO code (e.g., "B30") */
  eco: string;
  /** Opening name (e.g., "Sicilian Defense: Old Sicilian") */
  name: string;
}

/** A notable game from the explorer */
export interface LichessExplorerGame {
  /** Lichess game ID */
  id: string;
  /** White player name */
  white: LichessPlayer;
  /** Black player name */
  black: LichessPlayer;
  /** Game result: "1-0", "0-1", or "1/2-1/2" */
  winner: 'white' | 'black' | null;
  /** Year the game was played */
  year: number;
  /** Month the game was played (1-12) */
  month?: number;
  /** Speed of the game (for lichess db) */
  speed?: LichessSpeed;
}

/** Player information */
export interface LichessPlayer {
  /** Player name */
  name: string;
  /** Player rating at time of game */
  rating: number;
}

/** Full response from the Lichess Opening Explorer API */
export interface LichessExplorerResponse {
  /** Number of games where White won from this position */
  white: number;
  /** Number of draws from this position */
  draws: number;
  /** Number of games where Black won from this position */
  black: number;
  /** Available moves and their statistics */
  moves: LichessExplorerMove[];
  /** Sample of recent/notable games from this position */
  topGames: LichessExplorerGame[];
  /** Recent games (for lichess/player db) */
  recentGames?: LichessExplorerGame[];
  /** Opening name for this position */
  opening?: LichessOpeningInfo;
  /** Queue position if rate limited */
  queuePosition?: number;
}

/** Options for querying the masters database */
export interface LichessMastersOptions {
  /** FEN position to explore */
  fen: string;
  /** Include games since this year (default: 1952) */
  since?: number;
  /** Include games until this year (default: current) */
  until?: number;
  /** Maximum number of moves to return (default: 12) */
  moves?: number;
  /** Maximum number of top games to return (default: 15) */
  topGames?: number;
}

/** Options for querying the lichess database */
export interface LichessLichessOptions {
  /** FEN position to explore */
  fen: string;
  /** Player name to explore their games (mutually exclusive with rating filters) */
  player?: string;
  /** Filter by speeds */
  speeds?: LichessSpeed[];
  /** Filter by rating ranges (e.g., [1600, 1800, 2000]) */
  ratings?: LichessRating[];
  /** Include games since this date (YYYY-MM or YYYY-MM-DD) */
  since?: string;
  /** Include games until this date */
  until?: string;
  /** Maximum number of moves to return */
  moves?: number;
  /** Maximum number of top games to return */
  topGames?: number;
  /** Maximum number of recent games to return */
  recentGames?: number;
}

/** Options for querying a specific player's games */
export interface LichessPlayerOptions {
  /** FEN position to explore */
  fen: string;
  /** Lichess username */
  player: string;
  /** Color to filter by */
  color?: 'white' | 'black';
  /** Filter by speeds */
  speeds?: LichessSpeed[];
  /** Include games since this date */
  since?: string;
  /** Include games until this date */
  until?: string;
  /** Maximum number of moves to return */
  moves?: number;
  /** Maximum number of recent games to return */
  recentGames?: number;
}

/** Computed statistics for display */
export interface ExplorerStats {
  /** Total number of games */
  totalGames: number;
  /** White win percentage (0-100) */
  whiteWinPercent: number;
  /** Draw percentage (0-100) */
  drawPercent: number;
  /** Black win percentage (0-100) */
  blackWinPercent: number;
}

/** Move with computed statistics for display */
export interface ExplorerMoveStats extends LichessExplorerMove {
  /** Total games with this move */
  totalGames: number;
  /** Percentage of total position games */
  playRate: number;
  /** White win percentage */
  whiteWinPercent: number;
  /** Draw percentage */
  drawPercent: number;
  /** Black win percentage */
  blackWinPercent: number;
}

/** Full explorer result with computed statistics */
export interface ExplorerResult {
  /** Raw API response */
  raw: LichessExplorerResponse;
  /** Position statistics */
  stats: ExplorerStats;
  /** Moves with computed statistics, sorted by popularity */
  moves: ExplorerMoveStats[];
  /** Opening info if available */
  opening?: LichessOpeningInfo;
  /** Source database */
  database: LichessDatabase;
}
