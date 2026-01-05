/**
 * Stockfish Engine Types
 *
 * Types for UCI protocol communication and analysis results
 */

// =============================================================================
// Analysis Options
// =============================================================================

/**
 * Options for configuring analysis
 */
export interface AnalysisOptions {
  // Search limits (at least one required for bounded search)
  /** Maximum search depth (e.g., 20-40) */
  depth?: number;
  /** Time limit in milliseconds (e.g., 5000) */
  movetime?: number;
  /** Node limit for consistent analysis across hardware */
  nodes?: number;
  /** Run until explicitly stopped */
  infinite?: boolean;

  // Multi-line analysis
  /** Number of principal variations to analyze (1-5, default 1) */
  multiPv?: number;

  // Engine tuning
  /** Number of CPU threads (default: auto-detect) */
  threads?: number;
  /** Hash table size in MB (default: 128) */
  hash?: number;

  // Position context
  /** Restrict search to only these moves (SAN or UCI format) */
  searchMoves?: string[];
}

// =============================================================================
// Analysis Results
// =============================================================================

/**
 * Score representation from engine
 */
export interface EngineScore {
  /** Score type: centipawns or mate */
  type: 'cp' | 'mate';
  /** Value: centipawns (divide by 100 for pawns) or moves to mate */
  value: number;
}

/**
 * A single line of analysis (principal variation)
 */
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
  /** Principal variation moves (UCI format: e2e4, e7e5, ...) */
  moves: string[];
  /** Principal variation in SAN format (optional, computed) */
  movesSan?: string[];
}

/**
 * Streaming analysis info (emitted during search)
 */
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

/**
 * Final analysis result (when search completes)
 */
export interface AnalysisComplete {
  /** Position analyzed */
  fen: string;
  /** Best move in UCI format (e.g., "e2e4") */
  bestMove: string;
  /** Expected opponent reply (ponder move) */
  ponder?: string;
  /** Final analysis lines */
  lines: AnalysisLine[];
  /** Total analysis time in ms */
  totalTime: number;
}

// =============================================================================
// Engine Information
// =============================================================================

/**
 * UCI option definition
 */
export interface EngineOption {
  name: string;
  type: 'check' | 'spin' | 'combo' | 'button' | 'string';
  default?: string | number | boolean;
  min?: number;
  max?: number;
  var?: string[]; // For combo type
}

/**
 * Engine identification and capabilities
 */
export interface EngineInfo {
  /** Engine name (e.g., "Stockfish 17.1") */
  name: string;
  /** Author information */
  authors: string;
  /** NNUE evaluation enabled */
  nnue: boolean;
  /** Available UCI options */
  options: Map<string, EngineOption>;
}

// =============================================================================
// Internal State
// =============================================================================

/**
 * Current analysis state (internal)
 */
export interface AnalysisState {
  /** Position being analyzed */
  fen: string;
  /** Lines indexed by multipv number */
  lines: Map<number, AnalysisLine>;
  /** Expected number of lines (MultiPV setting) */
  expectedLines: number;
  /** Analysis start timestamp */
  startTime: number;
  /** Last depth where all lines were received */
  lastCompleteDepth: number;
  /** Current hashfull value */
  hashfull: number;
}

// =============================================================================
// Events
// =============================================================================

/**
 * Events emitted by StockfishService
 */
export interface StockfishEvents {
  /** Intermediate analysis update */
  info: (info: AnalysisInfo) => void;
  /** Analysis complete with bestmove */
  bestmove: (result: AnalysisComplete) => void;
  /** Error occurred */
  error: (error: Error) => void;
  /** Engine ready after initialization */
  ready: (info: EngineInfo) => void;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Stockfish service configuration
 */
export interface StockfishConfig {
  /** Path to Stockfish binary */
  binaryPath?: string;
  /** Default number of threads */
  defaultThreads?: number;
  /** Default hash table size (MB) */
  defaultHash?: number;
  /** Default MultiPV value */
  defaultMultiPv?: number;
  /** Maximum search depth (prevents infinite analysis) */
  maxDepth?: number;
  /** Timeout for engine initialization (ms) */
  initTimeout?: number;
  /** Timeout for stopping analysis (ms) */
  stopTimeout?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<StockfishConfig> = {
  binaryPath: './bin/stockfish',
  defaultThreads: 1,
  defaultHash: 128,
  defaultMultiPv: 1,
  maxDepth: 26,
  initTimeout: 10000,
  stopTimeout: 5000,
};

