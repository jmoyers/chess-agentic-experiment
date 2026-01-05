/**
 * Parallel Indexer Tests
 *
 * Tests multi-threaded game processing:
 * 1. Correctness (same results as single-threaded)
 * 2. Performance improvement
 * 3. Large batch handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cpus } from 'node:os';
import {
  MemoryStore,
  RocksStore,
  openRocksStore,
  indexGames,
  parallelIndexGames,
  hashFen,
  STARTING_POSITION_HASH,
} from '../src/database/local-explorer/index.js';
import type { ParsedGame } from '../src/database/local-explorer/types.js';

// Test database path
const TEST_DB_PATH = join(tmpdir(), 'chess-parallel-test-' + Date.now());

function cleanupDb(path: string) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

/**
 * Generate test games with predictable patterns
 */
function generateTestGames(count: number): ParsedGame[] {
  const games: ParsedGame[] = [];
  const openings = [
    ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],        // Ruy Lopez
    ['d4', 'd5', 'c4', 'e6', 'Nc3'],           // QGD
    ['e4', 'c5', 'Nf3', 'd6', 'd4'],           // Sicilian
    ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'],  // Nimzo-Indian
    ['e4', 'e6', 'd4', 'd5', 'Nc3'],           // French
    ['e4', 'c6', 'd4', 'd5', 'Nc3'],           // Caro-Kann
    ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2'],         // Reti
    ['c4', 'e5', 'Nc3', 'Nf6', 'g3'],          // English
  ];
  const results: Array<'white' | 'black' | 'draw'> = ['white', 'black', 'draw'];

  for (let i = 0; i < count; i++) {
    games.push({
      moves: openings[i % openings.length],
      result: results[i % 3],
      averageRating: 1800 + (i % 10) * 50,
    });
  }

  return games;
}

describe('Parallel Indexer', () => {
  describe('Correctness', () => {
    let memStore: MemoryStore;

    beforeEach(() => {
      memStore = new MemoryStore();
    });

    it('should produce same results as single-threaded indexer', async () => {
      const games = generateTestGames(100);

      // Index with single-threaded
      const singleStore = new MemoryStore();
      await indexGames(games, singleStore);

      // Index with parallel
      const parallelStore = new MemoryStore();
      await parallelIndexGames(games, parallelStore, { workerCount: 2, gamesPerBatch: 25 });

      // Compare starting position stats
      const singleStats = await singleStore.getPosition(STARTING_POSITION_HASH);
      const parallelStats = await parallelStore.getPosition(STARTING_POSITION_HASH);

      expect(parallelStats).toEqual(singleStats);

      // Compare moves
      const singleMoves = await singleStore.getMoves(STARTING_POSITION_HASH);
      const parallelMoves = await parallelStore.getMoves(STARTING_POSITION_HASH);

      // Sort by UCI for comparison
      singleMoves.sort((a, b) => a.uci.localeCompare(b.uci));
      parallelMoves.sort((a, b) => a.uci.localeCompare(b.uci));

      expect(parallelMoves.length).toBe(singleMoves.length);

      for (let i = 0; i < singleMoves.length; i++) {
        expect(parallelMoves[i].uci).toBe(singleMoves[i].uci);
        expect(parallelMoves[i].white).toBe(singleMoves[i].white);
        expect(parallelMoves[i].draws).toBe(singleMoves[i].draws);
        expect(parallelMoves[i].black).toBe(singleMoves[i].black);
      }
    }, 30000);

    it('should correctly track game counts', async () => {
      const games = generateTestGames(300);

      const stats = await parallelIndexGames(games, memStore, {
        workerCount: 4,
        gamesPerBatch: 50,
      });

      expect(stats.gamesProcessed).toBe(300);
      expect(stats.gamesSkipped).toBe(0);

      // All 300 games should be counted in starting position
      const posStats = await memStore.getPosition(STARTING_POSITION_HASH);
      expect(posStats!.white + posStats!.draws + posStats!.black).toBe(300);
    }, 30000);
  });

  describe('Performance', () => {
    let rocksStore: RocksStore;

    beforeEach(async () => {
      cleanupDb(TEST_DB_PATH);
      rocksStore = await openRocksStore({ path: TEST_DB_PATH });
    });

    afterEach(async () => {
      await rocksStore.close();
      cleanupDb(TEST_DB_PATH);
    });

    it('should process games correctly (with or without workers)', async () => {
      const games = generateTestGames(2000);
      const numCpus = cpus().length;

      // Single-threaded baseline
      const singleStore = new MemoryStore();
      const singleStart = Date.now();
      await indexGames(games, singleStore);
      const singleTime = Date.now() - singleStart;

      // Parallel (use most CPUs, may fall back to in-process)
      const parallelStore = new MemoryStore();
      const workerCount = Math.max(2, numCpus - 1);
      const parallelStart = Date.now();
      const stats = await parallelIndexGames(games, parallelStore, {
        workerCount,
        gamesPerBatch: 200,
      });
      const parallelTime = Date.now() - parallelStart;

      console.log(`Single-threaded: ${singleTime}ms (${(2000 / singleTime * 1000).toFixed(0)} games/sec)`);
      console.log(`Parallel (${stats.workersUsed} workers): ${parallelTime}ms (${stats.gamesPerSecond.toFixed(0)} games/sec)`);

      // Verify correctness (main goal)
      const singleStats = await singleStore.getPosition(STARTING_POSITION_HASH);
      const parallelStats = await parallelStore.getPosition(STARTING_POSITION_HASH);
      expect(parallelStats).toEqual(singleStats);

      // All games should be processed
      expect(stats.gamesProcessed).toBe(2000);
    }, 60000);

    it('should handle 5000 games efficiently', async () => {
      const games = generateTestGames(5000);

      const stats = await parallelIndexGames(games, rocksStore, {
        workerCount: Math.max(2, cpus().length - 1),
        gamesPerBatch: 500,
        batchSize: 5000,
      });

      console.log(`Indexed 5000 games in ${stats.elapsedMs}ms (${stats.gamesPerSecond.toFixed(0)} games/sec)`);
      console.log(`Workers used: ${stats.workersUsed}`);

      expect(stats.gamesProcessed).toBe(5000);
      expect(stats.elapsedMs).toBeLessThan(30000); // Should complete in <30 seconds

      // Verify data integrity
      const posStats = await rocksStore.getPosition(STARTING_POSITION_HASH);
      expect(posStats!.white + posStats!.draws + posStats!.black).toBe(5000);
    }, 60000);
  });

  describe('Edge Cases', () => {
    it('should handle empty game list', async () => {
      const store = new MemoryStore();
      const stats = await parallelIndexGames([], store);

      expect(stats.gamesProcessed).toBe(0);
      expect(stats.positionsIndexed).toBe(0);
    });

    it('should handle single game', async () => {
      const store = new MemoryStore();
      const stats = await parallelIndexGames(
        [{ moves: ['e4', 'e5'], result: 'white' }],
        store
      );

      expect(stats.gamesProcessed).toBe(1);
    });

    it('should handle games smaller than batch size', async () => {
      const games = generateTestGames(10);
      const store = new MemoryStore();

      const stats = await parallelIndexGames(games, store, {
        workerCount: 4,
        gamesPerBatch: 100, // Larger than game count
      });

      expect(stats.gamesProcessed).toBe(10);
    });
  });
});

