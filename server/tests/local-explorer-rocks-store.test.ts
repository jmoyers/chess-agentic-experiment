/**
 * RocksDB Store Tests
 *
 * Tests the RocksDB-backed persistent store:
 * 1. Basic CRUD operations
 * 2. Persistence across restarts
 * 3. Batch writes
 * 4. Correctness compared to memory store
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  RocksStore,
  openRocksStore,
  MemoryStore,
  hashFen,
  indexGames,
  STARTING_POSITION_HASH,
} from '../src/database/local-explorer/index.js';
import type { ParsedGame } from '../src/database/local-explorer/types.js';

// Test database path
const TEST_DB_PATH = join(tmpdir(), 'chess-rocks-test-' + Date.now());

// Cleanup helper
function cleanupDb(path: string) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

describe('RocksStore', () => {
  let store: RocksStore;

  beforeEach(async () => {
    cleanupDb(TEST_DB_PATH);
    store = await openRocksStore({ path: TEST_DB_PATH });
  });

  afterEach(async () => {
    await store.close();
    cleanupDb(TEST_DB_PATH);
  });

  describe('Basic Operations', () => {
    it('should store and retrieve position stats', async () => {
      await store.incrementPosition(STARTING_POSITION_HASH, 'white');
      await store.incrementPosition(STARTING_POSITION_HASH, 'black');
      await store.incrementPosition(STARTING_POSITION_HASH, 'draw');
      await store.flush();

      const stats = await store.getPosition(STARTING_POSITION_HASH);

      expect(stats).toEqual({ white: 1, draws: 1, black: 1 });
    });

    it('should store and retrieve move stats', async () => {
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white', 2000);
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'draw', 2100);
      await store.incrementMove(STARTING_POSITION_HASH, 'd2d4', 'black', 2200);
      await store.flush();

      const moves = await store.getMoves(STARTING_POSITION_HASH);

      expect(moves).toHaveLength(2);

      const e4Move = moves.find(m => m.uci === 'e2e4');
      expect(e4Move).toBeDefined();
      expect(e4Move!.white).toBe(1);
      expect(e4Move!.draws).toBe(1);
      expect(e4Move!.games).toBe(2);
      expect(e4Move!.ratingSum).toBe(4100);
    });

    it('should return null for non-existent positions', async () => {
      const stats = await store.getPosition(12345n);
      expect(stats).toBeNull();
    });

    it('should return empty array for positions with no moves', async () => {
      const moves = await store.getMoves(12345n);
      expect(moves).toEqual([]);
    });

    it('should check position existence', async () => {
      expect(await store.hasPosition(STARTING_POSITION_HASH)).toBe(false);

      await store.incrementPosition(STARTING_POSITION_HASH, 'white');
      await store.flush();

      expect(await store.hasPosition(STARTING_POSITION_HASH)).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch writes correctly', async () => {
      const updates = [
        { hash: STARTING_POSITION_HASH, move: 'e2e4', result: 'white' as const, rating: 2000 },
        { hash: STARTING_POSITION_HASH, move: 'e2e4', result: 'draw' as const, rating: 2100 },
        { hash: STARTING_POSITION_HASH, move: 'd2d4', result: 'black' as const, rating: 2200 },
      ];

      await store.batchWrite(updates);
      await store.flush();

      const posStats = await store.getPosition(STARTING_POSITION_HASH);
      expect(posStats).toEqual({ white: 1, draws: 1, black: 1 });

      const moves = await store.getMoves(STARTING_POSITION_HASH);
      expect(moves).toHaveLength(2);
    });

    it('should accumulate statistics across batches', async () => {
      // First batch
      await store.batchWrite([
        { hash: STARTING_POSITION_HASH, move: 'e2e4', result: 'white' as const },
        { hash: STARTING_POSITION_HASH, move: 'e2e4', result: 'white' as const },
      ]);
      await store.flush();

      // Second batch
      await store.batchWrite([
        { hash: STARTING_POSITION_HASH, move: 'e2e4', result: 'black' as const },
        { hash: STARTING_POSITION_HASH, move: 'e2e4', result: 'draw' as const },
      ]);
      await store.flush();

      const posStats = await store.getPosition(STARTING_POSITION_HASH);
      expect(posStats).toEqual({ white: 2, draws: 1, black: 1 });
    });
  });

  describe('Persistence', () => {
    it('should persist data across close/reopen', async () => {
      // Write data
      await store.incrementPosition(STARTING_POSITION_HASH, 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white', 2000);
      await store.flush();
      await store.close();

      // Reopen
      const store2 = await openRocksStore({ path: TEST_DB_PATH });

      // Verify data persisted
      const stats = await store2.getPosition(STARTING_POSITION_HASH);
      expect(stats).toEqual({ white: 1, draws: 0, black: 0 });

      const moves = await store2.getMoves(STARTING_POSITION_HASH);
      expect(moves).toHaveLength(1);
      expect(moves[0].uci).toBe('e2e4');

      await store2.close();
    });
  });

  describe('Statistics', () => {
    it('should report correct store stats', async () => {
      await store.incrementPosition(STARTING_POSITION_HASH, 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'd2d4', 'black');

      const hash2 = hashFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
      await store.incrementPosition(hash2, 'draw');
      await store.incrementMove(hash2, 'e7e5', 'draw');
      await store.flush();

      const stats = await store.getStats();

      expect(stats.positionCount).toBe(2);
      expect(stats.moveCount).toBe(3);
    });
  });
});

describe('RocksStore vs MemoryStore Correctness', () => {
  const games: ParsedGame[] = [
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], result: 'white', averageRating: 2100 },
    { moves: ['e4', 'c5', 'Nf3', 'd6'], result: 'black', averageRating: 2000 },
    { moves: ['d4', 'd5', 'c4', 'e6'], result: 'draw', averageRating: 2200 },
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], result: 'white', averageRating: 1900 },
    { moves: ['e4', 'e6', 'd4', 'd5'], result: 'black', averageRating: 2050 },
  ];

  let memStore: MemoryStore;
  let rocksStore: RocksStore;
  const rocksPath = join(tmpdir(), 'chess-rocks-compare-' + Date.now());

  beforeEach(async () => {
    cleanupDb(rocksPath);
    memStore = new MemoryStore();
    rocksStore = await openRocksStore({ path: rocksPath });
  });

  afterEach(async () => {
    await rocksStore.close();
    cleanupDb(rocksPath);
  });

  it('should produce identical results for position stats', async () => {
    // Index same games in both stores
    await indexGames(games, memStore);
    await indexGames(games, rocksStore);
    await rocksStore.flush();

    // Compare starting position
    const memStats = await memStore.getPosition(STARTING_POSITION_HASH);
    const rocksStats = await rocksStore.getPosition(STARTING_POSITION_HASH);

    expect(rocksStats).toEqual(memStats);
  });

  it('should produce identical results for move stats', async () => {
    await indexGames(games, memStore);
    await indexGames(games, rocksStore);
    await rocksStore.flush();

    // Compare moves from starting position
    const memMoves = await memStore.getMoves(STARTING_POSITION_HASH);
    const rocksMoves = await rocksStore.getMoves(STARTING_POSITION_HASH);

    // Sort both by UCI for comparison
    const sortByUci = (a: { uci: string }, b: { uci: string }) => a.uci.localeCompare(b.uci);
    memMoves.sort(sortByUci);
    rocksMoves.sort(sortByUci);

    expect(rocksMoves.length).toBe(memMoves.length);

    for (let i = 0; i < memMoves.length; i++) {
      expect(rocksMoves[i].uci).toBe(memMoves[i].uci);
      expect(rocksMoves[i].white).toBe(memMoves[i].white);
      expect(rocksMoves[i].draws).toBe(memMoves[i].draws);
      expect(rocksMoves[i].black).toBe(memMoves[i].black);
      expect(rocksMoves[i].games).toBe(memMoves[i].games);
      expect(rocksMoves[i].ratingSum).toBe(memMoves[i].ratingSum);
    }
  });

  it('should produce identical stats for multiple positions', async () => {
    await indexGames(games, memStore);
    await indexGames(games, rocksStore);
    await rocksStore.flush();

    // Check multiple positions
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Start
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', // After e4
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', // After e4 e5
    ];

    for (const fen of fens) {
      const hash = hashFen(fen);
      const memStats = await memStore.getPosition(hash);
      const rocksStats = await rocksStore.getPosition(hash);

      expect(rocksStats).toEqual(memStats);
    }
  });
});

describe('RocksStore Performance', () => {
  let store: RocksStore;
  const perfDbPath = join(tmpdir(), 'chess-rocks-perf-' + Date.now());

  afterAll(async () => {
    if (store) {
      await store.close();
    }
    cleanupDb(perfDbPath);
  });

  it('should handle 1000 games efficiently', async () => {
    store = await openRocksStore({ path: perfDbPath });

    // Generate 1000 games
    const games: ParsedGame[] = [];
    const openings = [
      ['e4', 'e5', 'Nf3', 'Nc6'],
      ['d4', 'd5', 'c4', 'e6'],
      ['e4', 'c5', 'Nf3', 'd6'],
    ];
    const results: Array<'white' | 'black' | 'draw'> = ['white', 'black', 'draw'];

    for (let i = 0; i < 1000; i++) {
      games.push({
        moves: openings[i % openings.length],
        result: results[i % 3],
        averageRating: 1800 + (i % 10) * 50,
      });
    }

    const startTime = Date.now();
    await indexGames(games, store, { batchSize: 500 });
    await store.flush();
    const elapsed = Date.now() - startTime;

    console.log(`Indexed 1000 games in ${elapsed}ms (${(1000 / elapsed * 1000).toFixed(0)} games/sec)`);

    // Should complete in reasonable time
    expect(elapsed).toBeLessThan(10000);

    // Verify data
    const stats = await store.getPosition(STARTING_POSITION_HASH);
    expect(stats!.white + stats!.draws + stats!.black).toBe(1000);
  }, 30000);
});

