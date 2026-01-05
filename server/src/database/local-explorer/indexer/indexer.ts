/**
 * Opening Indexer
 *
 * Main indexing pipeline that:
 * 1. Streams games from PGN files
 * 2. Processes each game to extract positions
 * 3. Batches writes to the store
 */

import type {
  WriteStore,
  IndexerConfig,
  IndexingProgress,
  ParsedGame,
  PositionUpdate,
} from '../types.js';
import { processGame } from './game-processor.js';
import { streamPgnFile, parseGamesFromString } from './pgn-parser.js';

/**
 * Index games from a PGN file into a store
 *
 * @param pgnPath - Path to PGN file
 * @param store - Store to write positions to
 * @param config - Indexer configuration
 *
 * @example
 * const store = new MemoryStore();
 * await indexPgnFile('masters.pgn', store, {
 *   maxMovesPerGame: 30,
 *   batchSize: 10000,
 *   onProgress: (p) => console.log(`${p.gamesProcessed} games...`),
 * });
 */
export async function indexPgnFile(
  pgnPath: string,
  store: WriteStore,
  config: IndexerConfig
): Promise<IndexingStats> {
  const maxMovesPerGame = config.maxMovesPerGame ?? 40;
  const batchSize = config.batchSize ?? 10000;

  const stats: IndexingStats = {
    gamesProcessed: 0,
    gamesSkipped: 0,
    positionsIndexed: 0,
    elapsedMs: 0,
  };

  const startTime = Date.now();
  let batch: PositionUpdate[] = [];

  // Stream and process games
  for await (const game of streamPgnFile(pgnPath, {
    minRating: config.minRating,
  })) {
    try {
      const updates = processGame(game, { maxMoves: maxMovesPerGame });

      // Add to batch
      batch.push(...updates);
      stats.positionsIndexed += updates.length;
      stats.gamesProcessed++;

      // Flush batch when full
      if (batch.length >= batchSize) {
        await store.batchWrite(batch);
        batch = [];

        // Report progress
        if (config.onProgress) {
          stats.elapsedMs = Date.now() - startTime;
          config.onProgress({
            gamesProcessed: stats.gamesProcessed,
            positionsIndexed: stats.positionsIndexed,
            elapsedMs: stats.elapsedMs,
            gamesPerSecond: stats.gamesProcessed / (stats.elapsedMs / 1000),
            phase: 'indexing',
          });
        }
      }
    } catch {
      stats.gamesSkipped++;
    }
  }

  // Flush remaining batch
  if (batch.length > 0) {
    await store.batchWrite(batch);
  }

  // Final flush
  await store.flush();

  stats.elapsedMs = Date.now() - startTime;

  // Final progress report
  if (config.onProgress) {
    config.onProgress({
      gamesProcessed: stats.gamesProcessed,
      positionsIndexed: stats.positionsIndexed,
      elapsedMs: stats.elapsedMs,
      gamesPerSecond: stats.gamesProcessed / (stats.elapsedMs / 1000),
      phase: 'flushing',
    });
  }

  return stats;
}

/**
 * Index games from a PGN string (for testing)
 */
export async function indexPgnString(
  pgnContent: string,
  store: WriteStore,
  config: Partial<IndexerConfig> = {}
): Promise<IndexingStats> {
  const maxMovesPerGame = config.maxMovesPerGame ?? 40;
  const batchSize = config.batchSize ?? 10000;

  const stats: IndexingStats = {
    gamesProcessed: 0,
    gamesSkipped: 0,
    positionsIndexed: 0,
    elapsedMs: 0,
  };

  const startTime = Date.now();
  let batch: PositionUpdate[] = [];

  // Parse games from string
  const games = parseGamesFromString(pgnContent, {
    minRating: config.minRating,
  });

  for (const game of games) {
    try {
      const updates = processGame(game, { maxMoves: maxMovesPerGame });

      batch.push(...updates);
      stats.positionsIndexed += updates.length;
      stats.gamesProcessed++;

      if (batch.length >= batchSize) {
        await store.batchWrite(batch);
        batch = [];
      }
    } catch {
      stats.gamesSkipped++;
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    await store.batchWrite(batch);
  }

  await store.flush();
  stats.elapsedMs = Date.now() - startTime;

  return stats;
}

/**
 * Index an array of parsed games
 */
export async function indexGames(
  games: ParsedGame[],
  store: WriteStore,
  config: Partial<IndexerConfig> = {}
): Promise<IndexingStats> {
  const maxMovesPerGame = config.maxMovesPerGame ?? 40;
  const batchSize = config.batchSize ?? 10000;

  const stats: IndexingStats = {
    gamesProcessed: 0,
    gamesSkipped: 0,
    positionsIndexed: 0,
    elapsedMs: 0,
  };

  const startTime = Date.now();
  let batch: PositionUpdate[] = [];

  for (const game of games) {
    try {
      const updates = processGame(game, { maxMoves: maxMovesPerGame });

      batch.push(...updates);
      stats.positionsIndexed += updates.length;
      stats.gamesProcessed++;

      if (batch.length >= batchSize) {
        await store.batchWrite(batch);
        batch = [];

        if (config.onProgress) {
          stats.elapsedMs = Date.now() - startTime;
          config.onProgress({
            gamesProcessed: stats.gamesProcessed,
            positionsIndexed: stats.positionsIndexed,
            elapsedMs: stats.elapsedMs,
            gamesPerSecond: stats.gamesProcessed / (stats.elapsedMs / 1000),
            phase: 'indexing',
          });
        }
      }
    } catch {
      stats.gamesSkipped++;
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    await store.batchWrite(batch);
  }

  await store.flush();
  stats.elapsedMs = Date.now() - startTime;

  return stats;
}

/**
 * Statistics from indexing
 */
export interface IndexingStats {
  /** Number of games successfully processed */
  gamesProcessed: number;
  /** Number of games skipped due to errors */
  gamesSkipped: number;
  /** Total position updates indexed */
  positionsIndexed: number;
  /** Total time in milliseconds */
  elapsedMs: number;
}

