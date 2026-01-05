/**
 * Local Explorer Query Layer Tests
 *
 * Tests the query interface that matches the Lichess API format:
 * 1. Query results format
 * 2. UCI to SAN conversion
 * 3. Opening name lookup
 * 4. Compatibility with existing code
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  LocalExplorer,
  createLocalExplorer,
  openRocksStore,
  compact,
  indexGames,
  STARTING_POSITION_HASH,
} from '../src/database/local-explorer/index.js';
import type { ParsedGame } from '../src/database/local-explorer/types.js';
import type { ExplorerResult } from '@chess/shared';

// Test paths
const ROCKS_PATH = join(tmpdir(), 'chess-query-rocks-' + Date.now());
const LMDB_PATH = join(tmpdir(), 'chess-query-lmdb-' + Date.now());

function cleanupDb(path: string) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

// Test games covering various openings
const testGames: ParsedGame[] = [
  // Ruy Lopez (e4 e5 Nf3 Nc6 Bb5) - 3 games
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], result: 'white', averageRating: 2400 },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], result: 'draw', averageRating: 2300 },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], result: 'black', averageRating: 2200 },

  // Italian Game (e4 e5 Nf3 Nc6 Bc4) - 2 games
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], result: 'white', averageRating: 2100 },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], result: 'white', averageRating: 2000 },

  // Sicilian (e4 c5) - 3 games
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4'], result: 'white', averageRating: 2250 },
  { moves: ['e4', 'c5', 'Nf3', 'Nc6'], result: 'draw', averageRating: 2150 },
  { moves: ['e4', 'c5', 'c3'], result: 'black', averageRating: 2050 },

  // Queen's Gambit (d4 d5 c4) - 2 games
  { moves: ['d4', 'd5', 'c4', 'e6'], result: 'draw', averageRating: 2500 },
  { moves: ['d4', 'd5', 'c4', 'c6'], result: 'white', averageRating: 2400 },
];

describe('LocalExplorer Query Layer', () => {
  let explorer: LocalExplorer;

  beforeAll(async () => {
    cleanupDb(ROCKS_PATH);
    cleanupDb(LMDB_PATH);

    // Create and populate RocksDB
    const rocksStore = await openRocksStore({ path: ROCKS_PATH });
    await indexGames(testGames, rocksStore);
    await rocksStore.flush();
    await rocksStore.close();

    // Compact to LMDB
    await compact({
      sourcePath: ROCKS_PATH,
      targetPath: LMDB_PATH,
    });

    // Create explorer
    explorer = await createLocalExplorer(LMDB_PATH);
  });

  afterAll(async () => {
    await explorer.close();
    cleanupDb(ROCKS_PATH);
    cleanupDb(LMDB_PATH);
  });

  describe('Query Format', () => {
    it('should return ExplorerResult matching Lichess API format', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );

      // Check result structure
      expect(result).toHaveProperty('raw');
      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('moves');
      expect(result).toHaveProperty('database');

      // Check stats structure
      expect(result.stats).toHaveProperty('totalGames');
      expect(result.stats).toHaveProperty('whiteWinPercent');
      expect(result.stats).toHaveProperty('drawPercent');
      expect(result.stats).toHaveProperty('blackWinPercent');

      // Check moves structure
      expect(result.moves.length).toBeGreaterThan(0);
      const firstMove = result.moves[0];
      expect(firstMove).toHaveProperty('san');
      expect(firstMove).toHaveProperty('uci');
      expect(firstMove).toHaveProperty('totalGames');
      expect(firstMove).toHaveProperty('playRate');
      expect(firstMove).toHaveProperty('whiteWinPercent');
      expect(firstMove).toHaveProperty('averageRating');
    });

    it('should return correct game counts', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );

      // All 10 games pass through starting position
      expect(result.stats.totalGames).toBe(10);
    });

    it('should return correct win percentages', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );

      // 5 white wins, 3 draws, 2 black wins out of 10
      expect(result.stats.whiteWinPercent).toBe(50);
      expect(result.stats.drawPercent).toBe(30);
      expect(result.stats.blackWinPercent).toBe(20);
    });

    it('should return database as "local"', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );

      expect(result.database).toBe('local');
    });
  });

  describe('Move Conversion', () => {
    it('should convert UCI to SAN notation', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );

      // Find e4 move
      const e4Move = result.moves.find(m => m.uci === 'e2e4');
      expect(e4Move).toBeDefined();
      expect(e4Move!.san).toBe('e4');

      // Find d4 move
      const d4Move = result.moves.find(m => m.uci === 'd2d4');
      expect(d4Move).toBeDefined();
      expect(d4Move!.san).toBe('d4');
    });

    it('should sort moves by popularity', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );

      // e4 should be first (8 games) over d4 (2 games)
      expect(result.moves[0].san).toBe('e4');
      expect(result.moves[0].totalGames).toBe(8);
      expect(result.moves[1].san).toBe('d4');
      expect(result.moves[1].totalGames).toBe(2);
    });

    it('should calculate correct play rates', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );

      const e4Move = result.moves.find(m => m.san === 'e4');
      expect(e4Move!.playRate).toBe(80); // 8 out of 10

      const d4Move = result.moves.find(m => m.san === 'd4');
      expect(d4Move!.playRate).toBe(20); // 2 out of 10
    });

    it('should calculate average ratings', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );

      const e4Move = result.moves.find(m => m.san === 'e4');
      expect(e4Move!.averageRating).toBeGreaterThan(0);
    });
  });

  describe('Opening Lookup', () => {
    it('should identify King\'s Pawn Opening after 1.e4', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
      );

      expect(result.opening).toBeDefined();
      expect(result.opening!.eco).toBe('B00');
      expect(result.opening!.name).toContain('King');
    });

    it('should identify Sicilian Defense after 1.e4 c5', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
      );

      expect(result.opening).toBeDefined();
      expect(result.opening!.eco).toBe('B20');
      expect(result.opening!.name).toContain('Sicilian');
    });

    it('should include opening in raw response', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
      );

      expect(result.raw.opening).toBeDefined();
      expect(result.raw.opening).toEqual(result.opening);
    });
  });

  describe('Position Queries', () => {
    it('should return empty result for unknown position', async () => {
      // Some random position that won't be in the database
      const result = await explorer.query(
        'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
      );

      expect(result.stats.totalGames).toBe(0);
      expect(result.moves).toHaveLength(0);
    });

    it('should handle position after Ruy Lopez', async () => {
      // Position after 1.e4 e5 2.Nf3 Nc6 3.Bb5
      const result = await explorer.query(
        'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3'
      );

      // 3 games reach this position in our test data
      expect(result.stats.totalGames).toBe(3);
      expect(result.opening?.name).toContain('Ruy Lopez');
    });

    it('should check position existence', async () => {
      const exists = await explorer.hasPosition(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );
      expect(exists).toBe(true);

      const notExists = await explorer.hasPosition(
        'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
      );
      expect(notExists).toBe(false);
    });
  });

  describe('Raw Response', () => {
    it('should include raw Lichess-compatible response', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );

      expect(result.raw).toHaveProperty('white');
      expect(result.raw).toHaveProperty('draws');
      expect(result.raw).toHaveProperty('black');
      expect(result.raw).toHaveProperty('moves');
      expect(result.raw).toHaveProperty('topGames');

      // Raw should match stats
      expect(result.raw.white).toBe(5); // 5 white wins
      expect(result.raw.draws).toBe(3); // 3 draws
      expect(result.raw.black).toBe(2); // 2 black wins
    });

    it('should include moves in raw response', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );

      expect(result.raw.moves.length).toBe(result.moves.length);

      const rawE4 = result.raw.moves.find(m => m.uci === 'e2e4');
      expect(rawE4).toBeDefined();
      expect(rawE4!.san).toBe('e4');
    });
  });

  describe('Database Stats', () => {
    it('should return database statistics', async () => {
      const stats = await explorer.getStats();

      expect(stats.positionCount).toBeGreaterThan(0);
      expect(stats.moveCount).toBeGreaterThan(0);
    });
  });

  describe('Query Options', () => {
    it('should limit number of moves returned', async () => {
      const result = await explorer.query(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        { limit: 1 }
      );

      expect(result.moves.length).toBe(1);
      expect(result.moves[0].san).toBe('e4'); // Most popular
    });
  });
});

describe('LocalExplorer Lifecycle', () => {
  // These tests use a separate database to test open/close cycles
  const LIFECYCLE_ROCKS = join(tmpdir(), 'chess-lifecycle-rocks-' + Date.now());
  const LIFECYCLE_LMDB = join(tmpdir(), 'chess-lifecycle-lmdb-' + Date.now());

  beforeAll(async () => {
    cleanupDb(LIFECYCLE_ROCKS);
    cleanupDb(LIFECYCLE_LMDB);

    // Create and populate a small database for lifecycle tests
    const rocksStore = await openRocksStore({ path: LIFECYCLE_ROCKS });
    await indexGames(
      [{ moves: ['e4', 'e5'], result: 'white', averageRating: 2000 }],
      rocksStore
    );
    await rocksStore.flush();
    await rocksStore.close();
    await compact({ sourcePath: LIFECYCLE_ROCKS, targetPath: LIFECYCLE_LMDB });
  });

  afterAll(() => {
    cleanupDb(LIFECYCLE_ROCKS);
    cleanupDb(LIFECYCLE_LMDB);
  });

  it('should auto-open on first query', async () => {
    const explorer = new LocalExplorer(LIFECYCLE_LMDB);
    // Don't call open()

    const result = await explorer.query(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );

    expect(result.stats.totalGames).toBeGreaterThan(0);
    await explorer.close();
  });

  it('should handle multiple open/close cycles', async () => {
    const explorer = new LocalExplorer(LIFECYCLE_LMDB);

    await explorer.open();
    await explorer.close();

    await explorer.open();
    const result = await explorer.query(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );
    expect(result.stats.totalGames).toBeGreaterThan(0);

    await explorer.close();
  });
});

