/**
 * Local Opening Explorer
 *
 * A local alternative to the Lichess Opening Explorer API.
 * Indexes chess games and provides position statistics.
 *
 * @example
 * ```typescript
 * import { LocalExplorer, hashFen } from './database/local-explorer';
 *
 * const explorer = new LocalExplorer('./data/opening-index.lmdb');
 * const result = await explorer.query('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
 * console.log(result.stats); // { totalGames: 1234, whiteWinPercent: 55, ... }
 * ```
 */

// Core types
export type {
  PositionStats,
  MoveStats,
  PositionData,
  GameResult,
  ParsedGame,
  PositionUpdate,
  WriteStore,
  ReadStore,
  StoreStats,
  IndexerConfig,
  IndexingProgress,
  OpeningInfo,
  LocalExplorerResult,
  LocalExplorerMove,
} from './types.js';

// Zobrist hashing
export {
  hashFen,
  hashFenSimple,
  hashToBuffer,
  bufferToHash,
  hashToHex,
  hexToHash,
  squareToIndex,
  indexToSquare,
  updateHashMove,
  updateHashCapture,
  updateHashSideToMove,
  updateHashCastling,
  updateHashEnPassant,
  STARTING_POSITION_HASH,
  AFTER_E4_HASH,
  AFTER_E4_E5_HASH,
  AFTER_D4_HASH,
  PIECE_INDICES,
} from './zobrist.js';

// In-memory store (for testing and small datasets)
export { MemoryStore } from './storage/memory-store.js';

// RocksDB store (for production indexing)
export { RocksStore, openRocksStore } from './storage/rocks-store.js';
export type { RocksStoreConfig } from './storage/rocks-store.js';

// LMDB store (for fast queries)
export { LmdbStore, openLmdbStore } from './storage/lmdb-store.js';
export type { LmdbStoreConfig } from './storage/lmdb-store.js';

// Compaction (RocksDB → LMDB)
export { compact, verifyCompaction } from './storage/compactor.js';
export type {
  CompactorConfig,
  CompactionProgress,
  CompactionResult,
} from './storage/compactor.js';

// Indexer components
export {
  processGame,
  processGameFromPgn,
  processFullPgn,
  parsePgnMoves,
  parseFullPgn,
  processGameBatch,
} from './indexer/game-processor.js';

export {
  streamPgnFile,
  countGamesInFile,
  parseGamesFromString,
} from './indexer/pgn-parser.js';

export {
  indexPgnFile,
  indexPgnString,
  indexGames,
} from './indexer/indexer.js';

export type { IndexingStats } from './indexer/indexer.js';

// Parallel indexer (multi-threaded)
export {
  parallelIndexPgnFile,
  parallelIndexGames,
  parallelIndexPgnString,
} from './indexer/parallel-indexer.js';

export type {
  ParallelIndexingStats,
  ParallelIndexerConfig,
} from './indexer/parallel-indexer.js';

// Query layer (Lichess API compatible)
export { LocalExplorer, createLocalExplorer } from './query.js';
export type { LocalExplorerConfig } from './query.js';
export type { GameProcessorConfig, ProcessingResult } from './indexer/game-processor.js';
export type { PgnParserConfig } from './indexer/pgn-parser.js';

