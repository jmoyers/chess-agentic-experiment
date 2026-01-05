/**
 * Indexer Worker Thread
 *
 * Runs in a worker thread to process games in parallel.
 * Each worker receives a batch of parsed games and returns position updates.
 *
 * Communication:
 * - Parent sends: { type: 'process', games: ParsedGame[], config: ProcessorConfig }
 * - Worker sends: { type: 'result', updates: PositionUpdate[], stats: WorkerStats }
 * - Worker sends: { type: 'error', error: string }
 */

import { parentPort, workerData } from 'node:worker_threads';
import { processGame } from './game-processor.js';
import type { ParsedGame, PositionUpdate } from '../types.js';

interface ProcessorConfig {
  maxMovesPerGame: number;
}

interface WorkerMessage {
  type: 'process';
  games: ParsedGame[];
  config: ProcessorConfig;
}

interface WorkerResult {
  type: 'result';
  updates: PositionUpdate[];
  stats: {
    gamesProcessed: number;
    gamesSkipped: number;
    positionsIndexed: number;
  };
}

interface WorkerError {
  type: 'error';
  error: string;
}

// Handle messages from parent
if (parentPort) {
  parentPort.on('message', (message: WorkerMessage) => {
    if (message.type === 'process') {
      try {
        const result = processGames(message.games, message.config);
        parentPort!.postMessage(result);
      } catch (err) {
        const errorResult: WorkerError = {
          type: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        };
        parentPort!.postMessage(errorResult);
      }
    }
  });

  // Signal ready
  parentPort.postMessage({ type: 'ready' });
}

/**
 * Process a batch of games and return position updates
 */
function processGames(games: ParsedGame[], config: ProcessorConfig): WorkerResult {
  const allUpdates: PositionUpdate[] = [];
  let gamesProcessed = 0;
  let gamesSkipped = 0;

  for (const game of games) {
    try {
      const updates = processGame(game, { maxMoves: config.maxMovesPerGame });
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

// Export for testing (when not running as worker)
export { processGames };
export type { WorkerMessage, WorkerResult, WorkerError, ProcessorConfig };

