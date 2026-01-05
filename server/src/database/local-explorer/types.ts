/**
 * Local Opening Explorer - Core Types
 *
 * These types define the data structures for indexing and querying
 * chess positions from a local database.
 */

// =============================================================================
// Position & Move Statistics
// =============================================================================

/**
 * Statistics for a single chess position
 */
export interface PositionStats {
  /** Number of games where White won from this position */
  white: number;
  /** Number of draws from this position */
  draws: number;
  /** Number of games where Black won from this position */
  black: number;
}

/**
 * Statistics for a specific move from a position
 */
export interface MoveStats extends PositionStats {
  /** Move in UCI notation (e.g., "e2e4") */
  uci: string;
  /** Sum of all player ratings who played this move */
  ratingSum: number;
  /** Number of games (for computing average rating) */
  games: number;
}

/**
 * Full position data including all moves played from it
 */
export interface PositionData {
  /** Zobrist hash of the position */
  hash: bigint;
  /** Aggregate statistics for the position */
  stats: PositionStats;
  /** Statistics for each move played from this position */
  moves: Map<string, MoveStats>;
}

// =============================================================================
// Game Processing
// =============================================================================

/** Result of a chess game */
export type GameResult = 'white' | 'black' | 'draw';

/**
 * Parsed game data ready for indexing
 */
export interface ParsedGame {
  /** Array of moves in UCI notation */
  moves: string[];
  /** Game result */
  result: GameResult;
  /** Average rating of players (optional) */
  averageRating?: number;
  /** Event/tournament name (optional) */
  event?: string;
  /** Year the game was played (optional) */
  year?: number;
}

/**
 * A position encountered during game replay
 */
export interface PositionUpdate {
  /** Zobrist hash of the position */
  hash: bigint;
  /** Move played from this position (UCI) */
  move: string;
  /** Result of the game */
  result: GameResult;
  /** Rating of player who made this move (optional) */
  rating?: number;
}

// =============================================================================
// Storage Interfaces
// =============================================================================

/**
 * Write-optimized store interface (for indexing phase)
 */
export interface WriteStore {
  /**
   * Increment statistics for a position
   */
  incrementPosition(hash: bigint, result: GameResult): Promise<void>;

  /**
   * Increment statistics for a move from a position
   */
  incrementMove(
    hash: bigint,
    move: string,
    result: GameResult,
    rating?: number
  ): Promise<void>;

  /**
   * Write multiple updates in a batch (more efficient)
   */
  batchWrite(updates: PositionUpdate[]): Promise<void>;

  /**
   * Flush any pending writes to disk
   */
  flush(): Promise<void>;

  /**
   * Close the store
   */
  close(): Promise<void>;

  /**
   * Get statistics about the store
   */
  getStats(): Promise<StoreStats>;
}

/**
 * Read-optimized store interface (for query phase)
 */
export interface ReadStore {
  /**
   * Get statistics for a position
   */
  getPosition(hash: bigint): Promise<PositionStats | null>;

  /**
   * Get all moves played from a position
   */
  getMoves(hash: bigint): Promise<MoveStats[]>;

  /**
   * Check if a position exists in the database
   */
  hasPosition(hash: bigint): Promise<boolean>;

  /**
   * Close the store
   */
  close(): Promise<void>;

  /**
   * Get statistics about the store
   */
  getStats(): Promise<StoreStats>;
}

/**
 * Statistics about a store
 */
export interface StoreStats {
  /** Number of unique positions */
  positionCount: number;
  /** Total number of move entries */
  moveCount: number;
  /** Size on disk in bytes */
  sizeBytes: number;
}

// =============================================================================
// Indexer Configuration
// =============================================================================

/**
 * Configuration for the indexing process
 */
export interface IndexerConfig {
  /** Maximum number of moves to index per game (default: 40) */
  maxMovesPerGame?: number;

  /** Minimum average rating to include a game (default: 0) */
  minRating?: number;

  /** Number of worker threads (default: CPU count - 1) */
  workerCount?: number;

  /** Batch size for writes (default: 10000) */
  batchSize?: number;

  /** Path to the write store */
  storePath: string;

  /** Progress callback */
  onProgress?: (progress: IndexingProgress) => void;
}

/**
 * Progress information during indexing
 */
export interface IndexingProgress {
  /** Number of games processed */
  gamesProcessed: number;
  /** Number of positions indexed */
  positionsIndexed: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Estimated games per second */
  gamesPerSecond: number;
  /** Current phase */
  phase: 'parsing' | 'indexing' | 'flushing';
}

// =============================================================================
// Query Results (matches Lichess API format)
// =============================================================================

/**
 * Opening information for a position
 */
export interface OpeningInfo {
  /** ECO code (e.g., "C50") */
  eco: string;
  /** Opening name (e.g., "Italian Game") */
  name: string;
}

/**
 * Query result matching the ExplorerResult format
 */
export interface LocalExplorerResult {
  /** Source database identifier */
  database: 'local';
  /** Position statistics */
  stats: {
    totalGames: number;
    whiteWinPercent: number;
    drawPercent: number;
    blackWinPercent: number;
  };
  /** Moves with statistics, sorted by popularity */
  moves: LocalExplorerMove[];
  /** Opening info if known */
  opening?: OpeningInfo;
}

/**
 * Move statistics in query result
 */
export interface LocalExplorerMove {
  /** Move in SAN notation (e.g., "e4") */
  san: string;
  /** Move in UCI notation (e.g., "e2e4") */
  uci: string;
  /** Total games with this move */
  totalGames: number;
  /** Percentage of position games (0-100) */
  playRate: number;
  /** White win percentage (0-100) */
  whiteWinPercent: number;
  /** Draw percentage (0-100) */
  drawPercent: number;
  /** Black win percentage (0-100) */
  blackWinPercent: number;
  /** Average rating of players who played this move */
  averageRating: number;
}

