/**
 * Parallel Indexer
 *
 * Coordinates multiple worker threads to index games in parallel.
 *
 * Architecture:
 * 1. Main thread streams PGN file, accumulates game batches
 * 2. Batches are distributed to worker pool
 * 3. Workers process games → position updates
 * 4. Main thread writes updates to RocksDB
 *
 * This achieves parallelism on the CPU-bound game processing
 * while keeping disk I/O serialized (RocksDB handles this well).
 */

import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  WriteStore,
  IndexerConfig,
  IndexingProgress,
  ParsedGame,
  PositionUpdate,
} from '../types.js';
import { streamPgnFile, parseGamesFromString } from './pgn-parser.js';
import { processGame } from './game-processor.js';
import type { WorkerResult, ProcessorConfig } from './worker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try to find the worker file in dist/ or src/
function getWorkerPath(): string {
  // When running from dist/ (compiled)
  const distPath = join(__dirname, 'worker.js');
  if (existsSync(distPath)) {
    return distPath;
  }

  // When running from project root dist/
  const projectDistPath = join(__dirname, '../../../../dist/database/local-explorer/indexer/worker.js');
  if (existsSync(projectDistPath)) {
    return projectDistPath;
  }

  // Fallback - will use in-process fallback
  return '';
}

/**
 * Statistics from parallel indexing
 */
export interface ParallelIndexingStats {
  gamesProcessed: number;
  gamesSkipped: number;
  positionsIndexed: number;
  elapsedMs: number;
  gamesPerSecond: number;
  workersUsed: number;
}

/**
 * Configuration for parallel indexer
 */
export interface ParallelIndexerConfig extends IndexerConfig {
  /** Number of worker threads (default: CPU count - 1) */
  workerCount?: number;
  /** Games per batch sent to workers (default: 500) */
  gamesPerBatch?: number;
}

/**
 * Worker pool manager
 * Falls back to in-process execution if worker file not found
 */
class WorkerPool {
  private workers: Worker[] = [];
  private available: Worker[] = [];
  private pending: Map<Worker, (result: WorkerResult) => void> = new Map();
  private config: ProcessorConfig;
  private useInProcess: boolean;

  constructor(workerCount: number, config: ProcessorConfig) {
    this.config = config;
    const workerPath = getWorkerPath();
    this.useInProcess = !workerPath;

    if (this.useInProcess) {
      // Fallback to in-process parallel execution
      return;
    }

    for (let i = 0; i < workerCount; i++) {
      try {
        const worker = new Worker(workerPath);
        this.workers.push(worker);
        this.available.push(worker);

        worker.on('message', (msg) => {
          if (msg.type === 'result' || msg.type === 'error') {
            const resolver = this.pending.get(worker);
            if (resolver) {
              this.pending.delete(worker);
              this.available.push(worker);
              resolver(msg);
            }
          }
        });

        worker.on('error', (err) => {
          console.error('Worker error:', err);
          // Mark as unavailable but don't try to recreate
          const idx = this.available.indexOf(worker);
          if (idx !== -1) {
            this.available.splice(idx, 1);
          }
        });
      } catch {
        // Worker creation failed - fall back to in-process
        this.useInProcess = true;
        break;
      }
    }

    // If no workers created, use in-process
    if (this.workers.length === 0) {
      this.useInProcess = true;
    }
  }

  /**
   * Process a batch of games using an available worker or in-process
   */
  async process(games: ParsedGame[]): Promise<WorkerResult> {
    if (this.useInProcess) {
      return this.processInProcess(games);
    }

    // Wait for available worker
    while (this.available.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const worker = this.available.pop()!;

    return new Promise((resolve) => {
      this.pending.set(worker, resolve);
      worker.postMessage({
        type: 'process',
        games,
        config: this.config,
      });
    });
  }

  /**
   * Process games in-process (fallback)
   */
  private processInProcess(games: ParsedGame[]): WorkerResult {
    const allUpdates: PositionUpdate[] = [];
    let gamesProcessed = 0;
    let gamesSkipped = 0;

    for (const game of games) {
      try {
        const updates = processGame(game, { maxMoves: this.config.maxMovesPerGame });
        allUpdates.push(...updates);
        gamesProcessed++;
      } catch {
        gamesSkipped++;
      }
    }

    return {
      type: 'result',
      updates: allUpdates,
      stats: {
        gamesProcessed,
        gamesSkipped,
        positionsIndexed: allUpdates.length,
      },
    };
  }

  /**
   * Wait for all pending work to complete
   */
  async drain(): Promise<void> {
    while (this.pending.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Terminate all workers
   */
  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.available = [];
    this.pending.clear();
  }

  get workerCount(): number {
    return this.useInProcess ? 1 : this.workers.length;
  }

  get isUsingWorkers(): boolean {
    return !this.useInProcess;
  }
}

/**
 * Index games from a PGN file using multiple worker threads
 */
export async function parallelIndexPgnFile(
  pgnPath: string,
  store: WriteStore,
  config: ParallelIndexerConfig
): Promise<ParallelIndexingStats> {
  const workerCount = config.workerCount ?? Math.max(1, cpus().length - 1);
  const gamesPerBatch = config.gamesPerBatch ?? 500;
  const maxMovesPerGame = config.maxMovesPerGame ?? 40;
  const batchSize = config.batchSize ?? 10000;

  const stats: ParallelIndexingStats = {
    gamesProcessed: 0,
    gamesSkipped: 0,
    positionsIndexed: 0,
    elapsedMs: 0,
    gamesPerSecond: 0,
    workersUsed: workerCount,
  };

  const startTime = Date.now();
  const pool = new WorkerPool(workerCount, { maxMovesPerGame });

  // Collect results as they come in
  const pendingResults: Promise<WorkerResult>[] = [];
  let gameBatch: ParsedGame[] = [];
  let updateBuffer: PositionUpdate[] = [];

  // Process results and write to store
  const flushResults = async () => {
    if (pendingResults.length === 0) return;

    const results = await Promise.all(pendingResults);
    pendingResults.length = 0;

    for (const result of results) {
      if (result.type === 'result') {
        stats.gamesProcessed += result.stats.gamesProcessed;
        stats.gamesSkipped += result.stats.gamesSkipped;
        updateBuffer.push(...result.updates);
      }
    }

    // Flush to store if buffer is large enough
    if (updateBuffer.length >= batchSize) {
      await store.batchWrite(updateBuffer);
      stats.positionsIndexed += updateBuffer.length;
      updateBuffer = [];

      // Report progress
      if (config.onProgress) {
        stats.elapsedMs = Date.now() - startTime;
        stats.gamesPerSecond = stats.gamesProcessed / (stats.elapsedMs / 1000);
        config.onProgress({
          gamesProcessed: stats.gamesProcessed,
          positionsIndexed: stats.positionsIndexed,
          elapsedMs: stats.elapsedMs,
          gamesPerSecond: stats.gamesPerSecond,
          phase: 'indexing',
        });
      }
    }
  };

  // Stream games and distribute to workers
  for await (const game of streamPgnFile(pgnPath, {
    minRating: config.minRating,
  })) {
    gameBatch.push(game);

    if (gameBatch.length >= gamesPerBatch) {
      pendingResults.push(pool.process([...gameBatch]));
      gameBatch = [];

      // Periodically flush results
      if (pendingResults.length >= workerCount * 2) {
        await flushResults();
      }
    }
  }

  // Process remaining games
  if (gameBatch.length > 0) {
    pendingResults.push(pool.process(gameBatch));
  }

  // Wait for all workers and flush final results
  await pool.drain();
  await flushResults();

  // Write remaining updates
  if (updateBuffer.length > 0) {
    await store.batchWrite(updateBuffer);
    stats.positionsIndexed += updateBuffer.length;
  }

  await store.flush();
  await pool.terminate();

  stats.elapsedMs = Date.now() - startTime;
  stats.gamesPerSecond = stats.gamesProcessed / (stats.elapsedMs / 1000);
  stats.workersUsed = pool.isUsingWorkers ? pool.workerCount : 1;

  // Final progress report
  if (config.onProgress) {
    config.onProgress({
      gamesProcessed: stats.gamesProcessed,
      positionsIndexed: stats.positionsIndexed,
      elapsedMs: stats.elapsedMs,
      gamesPerSecond: stats.gamesPerSecond,
      phase: 'flushing',
    });
  }

  return stats;
}

/**
 * Index games from an array using multiple worker threads
 * (Useful for testing)
 */
export async function parallelIndexGames(
  games: ParsedGame[],
  store: WriteStore,
  config: Partial<ParallelIndexerConfig> = {}
): Promise<ParallelIndexingStats> {
  const workerCount = config.workerCount ?? Math.max(1, cpus().length - 1);
  const gamesPerBatch = config.gamesPerBatch ?? 500;
  const maxMovesPerGame = config.maxMovesPerGame ?? 40;
  const batchSize = config.batchSize ?? 10000;

  const stats: ParallelIndexingStats = {
    gamesProcessed: 0,
    gamesSkipped: 0,
    positionsIndexed: 0,
    elapsedMs: 0,
    gamesPerSecond: 0,
    workersUsed: workerCount,
  };

  const startTime = Date.now();
  const pool = new WorkerPool(workerCount, { maxMovesPerGame });

  // Split games into batches
  const batches: ParsedGame[][] = [];
  for (let i = 0; i < games.length; i += gamesPerBatch) {
    batches.push(games.slice(i, i + gamesPerBatch));
  }

  // Process all batches in parallel
  const results = await Promise.all(batches.map((batch) => pool.process(batch)));

  // Collect all updates
  const allUpdates: PositionUpdate[] = [];
  for (const result of results) {
    if (result.type === 'result') {
      stats.gamesProcessed += result.stats.gamesProcessed;
      stats.gamesSkipped += result.stats.gamesSkipped;
      allUpdates.push(...result.updates);
    }
  }

  // Write to store in batches
  for (let i = 0; i < allUpdates.length; i += batchSize) {
    const batch = allUpdates.slice(i, i + batchSize);
    await store.batchWrite(batch);
    stats.positionsIndexed += batch.length;
  }

  await store.flush();
  
  stats.elapsedMs = Date.now() - startTime;
  stats.gamesPerSecond = stats.gamesProcessed / (stats.elapsedMs / 1000);
  stats.workersUsed = pool.isUsingWorkers ? pool.workerCount : 1;
  
  await pool.terminate();

  return stats;
}

/**
 * Index games from PGN string using multiple workers
 * (Useful for testing)
 */
export async function parallelIndexPgnString(
  pgnContent: string,
  store: WriteStore,
  config: Partial<ParallelIndexerConfig> = {}
): Promise<ParallelIndexingStats> {
  const games = parseGamesFromString(pgnContent, {
    minRating: config.minRating,
  });

  return parallelIndexGames(games, store, config);
}

