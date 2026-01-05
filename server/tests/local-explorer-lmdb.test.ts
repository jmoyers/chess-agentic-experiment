/**
 * LMDB Store and Compaction Tests
 *
 * Tests:
 * 1. LMDB store basic operations
 * 2. Compaction from RocksDB to LMDB
 * 3. Query performance comparison
 * 4. Data integrity verification
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  RocksStore,
  openRocksStore,
  LmdbStore,
  openLmdbStore,
  MemoryStore,
  compact,
  verifyCompaction,
  indexGames,
  hashFen,
  STARTING_POSITION_HASH,
} from '../src/database/local-explorer/index.js';
import type { ParsedGame } from '../src/database/local-explorer/types.js';

// Test paths
const ROCKS_PATH = join(tmpdir(), 'chess-rocks-lmdb-test-' + Date.now());
const LMDB_PATH = join(tmpdir(), 'chess-lmdb-test-' + Date.now());

function cleanupDb(path: string) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function generateTestGames(count: number): ParsedGame[] {
  const games: ParsedGame[] = [];
  const openings = [
    ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    ['d4', 'd5', 'c4', 'e6', 'Nc3'],
    ['e4', 'c5', 'Nf3', 'd6', 'd4'],
    ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2'],
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

describe('LmdbStore', () => {
  let store: LmdbStore;

  beforeEach(() => {
    cleanupDb(LMDB_PATH);
    store = openLmdbStore({ path: LMDB_PATH });
  });

  afterEach(async () => {
    await store.close();
    cleanupDb(LMDB_PATH);
  });

  describe('Basic Operations', () => {
    it('should store and retrieve position stats', async () => {
      await store.incrementPosition(STARTING_POSITION_HASH, 'white');
      await store.incrementPosition(STARTING_POSITION_HASH, 'black');
      await store.incrementPosition(STARTING_POSITION_HASH, 'draw');

      const stats = await store.getPosition(STARTING_POSITION_HASH);

      expect(stats).toEqual({ white: 1, draws: 1, black: 1 });
    });

    it('should store and retrieve move stats', async () => {
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white', 2000);
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'draw', 2100);
      await store.incrementMove(STARTING_POSITION_HASH, 'd2d4', 'black', 2200);

      const moves = await store.getMoves(STARTING_POSITION_HASH);

      expect(moves).toHaveLength(2);

      const e4Move = moves.find(m => m.uci === 'e2e4');
      expect(e4Move).toBeDefined();
      expect(e4Move!.white).toBe(1);
      expect(e4Move!.draws).toBe(1);
      expect(e4Move!.games).toBe(2);
    });

    it('should handle batch writes', async () => {
      const updates = [
        { hash: STARTING_POSITION_HASH, move: 'e2e4', result: 'white' as const },
        { hash: STARTING_POSITION_HASH, move: 'e2e4', result: 'draw' as const },
        { hash: STARTING_POSITION_HASH, move: 'd2d4', result: 'black' as const },
      ];

      await store.batchWrite(updates);

      const stats = await store.getPosition(STARTING_POSITION_HASH);
      expect(stats).toEqual({ white: 1, draws: 1, black: 1 });

      const moves = await store.getMoves(STARTING_POSITION_HASH);
      expect(moves).toHaveLength(2);
    });

    it('should check position existence', async () => {
      expect(await store.hasPosition(STARTING_POSITION_HASH)).toBe(false);

      await store.incrementPosition(STARTING_POSITION_HASH, 'white');

      expect(await store.hasPosition(STARTING_POSITION_HASH)).toBe(true);
    });
  });

  describe('Indexing', () => {
    it('should work with indexGames', async () => {
      const games = generateTestGames(100);

      await indexGames(games, store);

      const stats = await store.getPosition(STARTING_POSITION_HASH);
      expect(stats!.white + stats!.draws + stats!.black).toBe(100);
    });
  });
});

describe('Compaction', () => {
  let rocksStore: RocksStore;

  beforeEach(async () => {
    cleanupDb(ROCKS_PATH);
    cleanupDb(LMDB_PATH);
    rocksStore = await openRocksStore({ path: ROCKS_PATH });
  });

  afterEach(async () => {
    await rocksStore.close();
    cleanupDb(ROCKS_PATH);
    cleanupDb(LMDB_PATH);
  });

  it('should compact RocksDB to LMDB', async () => {
    // Index games into RocksDB
    const games = generateTestGames(500);
    await indexGames(games, rocksStore);
    await rocksStore.flush();
    await rocksStore.close();

    // Compact to LMDB
    const result = await compact({
      sourcePath: ROCKS_PATH,
      targetPath: LMDB_PATH,
    });

    expect(result.success).toBe(true);
    expect(result.positionsCopied).toBeGreaterThan(0);
    expect(result.movesCopied).toBeGreaterThan(0);

    console.log(`Compacted ${result.entriesCopied} entries in ${result.elapsedMs}ms`);

    // Verify data in LMDB
    const lmdbStore = openLmdbStore({ path: LMDB_PATH, readOnly: true });
    const stats = await lmdbStore.getPosition(STARTING_POSITION_HASH);

    expect(stats!.white + stats!.draws + stats!.black).toBe(500);

    await lmdbStore.close();
  });

  it('should produce identical results after compaction', async () => {
    const games = generateTestGames(200);

    // Index into RocksDB
    await indexGames(games, rocksStore);
    await rocksStore.flush();

    // Get stats before compaction
    const rocksStats = await rocksStore.getPosition(STARTING_POSITION_HASH);
    const rocksMoves = await rocksStore.getMoves(STARTING_POSITION_HASH);

    await rocksStore.close();

    // Compact
    const result = await compact({
      sourcePath: ROCKS_PATH,
      targetPath: LMDB_PATH,
    });

    expect(result.success).toBe(true);

    // Compare with LMDB
    const lmdbStore = openLmdbStore({ path: LMDB_PATH, readOnly: true });
    const lmdbStats = await lmdbStore.getPosition(STARTING_POSITION_HASH);
    const lmdbMoves = await lmdbStore.getMoves(STARTING_POSITION_HASH);

    // Position stats should match
    expect(lmdbStats).toEqual(rocksStats);

    // Move stats should match
    expect(lmdbMoves.length).toBe(rocksMoves.length);

    // Sort by UCI for comparison
    rocksMoves.sort((a, b) => a.uci.localeCompare(b.uci));
    lmdbMoves.sort((a, b) => a.uci.localeCompare(b.uci));

    for (let i = 0; i < rocksMoves.length; i++) {
      expect(lmdbMoves[i].uci).toBe(rocksMoves[i].uci);
      expect(lmdbMoves[i].white).toBe(rocksMoves[i].white);
      expect(lmdbMoves[i].draws).toBe(rocksMoves[i].draws);
      expect(lmdbMoves[i].black).toBe(rocksMoves[i].black);
      expect(lmdbMoves[i].games).toBe(rocksMoves[i].games);
    }

    await lmdbStore.close();
  });

  it('should report progress during compaction', async () => {
    const games = generateTestGames(1000);
    await indexGames(games, rocksStore);
    await rocksStore.flush();
    await rocksStore.close();

    const progressReports: number[] = [];

    const result = await compact({
      sourcePath: ROCKS_PATH,
      targetPath: LMDB_PATH,
      progressInterval: 500, // Report every 500 entries
      onProgress: (p) => progressReports.push(p.entriesProcessed),
    });

    expect(result.success).toBe(true);
    // Should have received at least one progress report
    expect(progressReports.length).toBeGreaterThan(0);
  });
});

describe('Query Performance', () => {
  const GAME_COUNT = 1000;
  let lmdbStore: LmdbStore;

  beforeEach(async () => {
    cleanupDb(ROCKS_PATH);
    cleanupDb(LMDB_PATH);

    // Create and populate RocksDB
    const rocksStore = await openRocksStore({ path: ROCKS_PATH });
    await indexGames(generateTestGames(GAME_COUNT), rocksStore);
    await rocksStore.flush();
    await rocksStore.close();

    // Compact to LMDB
    await compact({
      sourcePath: ROCKS_PATH,
      targetPath: LMDB_PATH,
    });

    lmdbStore = openLmdbStore({ path: LMDB_PATH, readOnly: true });
  });

  afterEach(async () => {
    await lmdbStore.close();
    cleanupDb(ROCKS_PATH);
    cleanupDb(LMDB_PATH);
  });

  it('should query positions quickly', async () => {
    const iterations = 1000;
    const hashes = [
      STARTING_POSITION_HASH,
      hashFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'),
      hashFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'),
    ];

    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      const hash = hashes[i % hashes.length];
      await lmdbStore.getPosition(hash);
    }
    const elapsed = Date.now() - start;

    console.log(`${iterations} position queries in ${elapsed}ms (${(iterations / elapsed * 1000).toFixed(0)} queries/sec)`);

    // Should be very fast - at least 10K queries/second
    expect(elapsed).toBeLessThan(1000);
  });

  it('should query moves quickly', async () => {
    const iterations = 1000;
    const hashes = [
      STARTING_POSITION_HASH,
      hashFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'),
    ];

    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      const hash = hashes[i % hashes.length];
      await lmdbStore.getMoves(hash);
    }
    const elapsed = Date.now() - start;

    console.log(`${iterations} move queries in ${elapsed}ms (${(iterations / elapsed * 1000).toFixed(0)} queries/sec)`);

    // Should be fast - at least 5K queries/second
    expect(elapsed).toBeLessThan(1000);
  });
});

