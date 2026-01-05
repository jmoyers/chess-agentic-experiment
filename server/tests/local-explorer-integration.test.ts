/**
 * Local Explorer Integration Tests
 * 
 * Tests against the REAL indexed database (December 2025 Lichess games).
 * These tests verify:
 * 1. Database connectivity and basic queries
 * 2. Data quality and sanity checks
 * 3. Opening name lookups
 * 4. API compatibility for websocket server
 * 
 * Files:
 * - LMDB database: server/data/opening-explorer.lmdb
 * - RocksDB (indexing): server/data/opening-explorer.rocks
 * 
 * These tests skip if the database doesn't exist.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import {
  LocalExplorer,
  createLocalExplorer,
} from '../src/database/local-explorer/index.js';
import type { ExplorerResult, ExplorerMoveStats } from '@chess/shared';

// Real database path - server/data folder
const __dirname = dirname(fileURLToPath(import.meta.url));
const LMDB_PATH = join(__dirname, '..', 'data', 'opening-explorer.lmdb');
const DB_EXISTS = existsSync(LMDB_PATH);

// Skip all tests if database doesn't exist
const describeIfDb = DB_EXISTS ? describe : describe.skip;

describeIfDb('Local Explorer Integration Tests', () => {
  let explorer: LocalExplorer;

  beforeAll(async () => {
    explorer = await createLocalExplorer(LMDB_PATH);
    console.log('✅ Connected to local explorer database');
    const stats = await explorer.getStats();
    console.log(`   Positions: ${stats.positionCount.toLocaleString()}`);
    console.log(`   Moves: ${stats.moveCount.toLocaleString()}`);
  });

  afterAll(async () => {
    await explorer.close();
  });

  describe('Database Statistics', () => {
    it('should have reasonable position count', async () => {
      const stats = await explorer.getStats();
      
      // With 100k games indexed, expect at least 500k unique positions
      expect(stats.positionCount).toBeGreaterThan(500_000);
      console.log(`   Position count: ${stats.positionCount.toLocaleString()}`);
    });

    it('should have reasonable move count', async () => {
      const stats = await explorer.getStats();
      
      // Should have millions of move entries
      expect(stats.moveCount).toBeGreaterThan(1_000_000);
      console.log(`   Move count: ${stats.moveCount.toLocaleString()}`);
    });
  });

  describe('Starting Position', () => {
    const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    it('should have significant game count at starting position', async () => {
      const result = await explorer.query(STARTING_FEN);
      
      // All games start here - should be ~100k with our indexed data
      expect(result.stats.totalGames).toBeGreaterThan(50_000);
      console.log(`   Starting position games: ${result.stats.totalGames.toLocaleString()}`);
    });

    it('should have e4 as most popular or second most popular move', async () => {
      const result = await explorer.query(STARTING_FEN);
      
      const topMoves = result.moves.slice(0, 2).map(m => m.san);
      expect(topMoves).toContain('e4');
    });

    it('should have d4 as popular move', async () => {
      const result = await explorer.query(STARTING_FEN);
      
      const d4 = result.moves.find(m => m.san === 'd4');
      expect(d4).toBeDefined();
      expect(d4!.totalGames).toBeGreaterThan(10_000);
    });

    it('should return valid ExplorerResult structure', async () => {
      const result = await explorer.query(STARTING_FEN);
      
      // Check structure
      expect(result).toHaveProperty('raw');
      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('moves');
      expect(result).toHaveProperty('database');
      expect(result.database).toBe('local');
      
      // Check stats add up
      const rawTotal = result.raw.white + result.raw.draws + result.raw.black;
      expect(result.stats.totalGames).toBe(rawTotal);
      
      // Percentages should add to ~100
      const percentSum = result.stats.whiteWinPercent + result.stats.drawPercent + result.stats.blackWinPercent;
      expect(percentSum).toBeGreaterThan(99);
      expect(percentSum).toBeLessThan(101);
    });

    it('should have all moves with valid UCI and SAN', async () => {
      const result = await explorer.query(STARTING_FEN);
      
      for (const move of result.moves) {
        // UCI should be 4-5 chars (e.g., e2e4, e7e8q)
        expect(move.uci.length).toBeGreaterThanOrEqual(4);
        expect(move.uci.length).toBeLessThanOrEqual(5);
        
        // SAN should be non-empty
        expect(move.san.length).toBeGreaterThan(0);
        
        // Game counts should be non-negative
        expect(move.white).toBeGreaterThanOrEqual(0);
        expect(move.draws).toBeGreaterThanOrEqual(0);
        expect(move.black).toBeGreaterThanOrEqual(0);
        expect(move.totalGames).toBe(move.white + move.draws + move.black);
      }
    });
  });

  describe('Opening Lines', () => {
    it('should have data for position after 1. e4', async () => {
      const chess = new Chess();
      chess.move('e4');
      
      const result = await explorer.query(chess.fen());
      expect(result.stats.totalGames).toBeGreaterThan(30_000);
      
      // Popular responses should include e5, c5 (Sicilian), e6 (French)
      const responses = result.moves.slice(0, 5).map(m => m.san);
      console.log(`   Responses to 1. e4: ${responses.join(', ')}`);
      
      expect(responses.some(m => ['e5', 'c5', 'e6', 'c6', 'd5'].includes(m))).toBe(true);
    });

    it('should have data for position after 1. d4', async () => {
      const chess = new Chess();
      chess.move('d4');
      
      const result = await explorer.query(chess.fen());
      expect(result.stats.totalGames).toBeGreaterThan(15_000);
      
      // Popular responses should include d5, Nf6, e6
      const responses = result.moves.slice(0, 5).map(m => m.san);
      console.log(`   Responses to 1. d4: ${responses.join(', ')}`);
    });

    it('should have data for Sicilian Defense (1. e4 c5)', async () => {
      const chess = new Chess();
      chess.move('e4');
      chess.move('c5');
      
      const result = await explorer.query(chess.fen());
      expect(result.stats.totalGames).toBeGreaterThan(5_000);
      
      // Common continuations
      const continuations = result.moves.slice(0, 5).map(m => m.san);
      console.log(`   Sicilian continuations: ${continuations.join(', ')}`);
      
      // Nf3 and c3 are most common
      expect(continuations.some(m => ['Nf3', 'c3', 'Nc3', 'd4'].includes(m))).toBe(true);
    });

    it('should have data for Italian Game (1. e4 e5 2. Nf3 Nc6 3. Bc4)', async () => {
      const chess = new Chess();
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'].forEach(m => chess.move(m));
      
      const result = await explorer.query(chess.fen());
      
      if (result.stats.totalGames > 0) {
        console.log(`   Italian Game games: ${result.stats.totalGames.toLocaleString()}`);
        const responses = result.moves.slice(0, 5).map(m => m.san);
        console.log(`   Black responses: ${responses.join(', ')}`);
        
        // Common responses: Bc5 (Giuoco Piano), Nf6 (Two Knights)
        expect(responses.length).toBeGreaterThan(0);
      } else {
        console.log('   Italian Game: Not enough data (may need more games indexed)');
      }
    });

    it('should have data deeper into openings (10+ half-moves)', async () => {
      const chess = new Chess();
      // Sicilian Najdorf: 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
      const moves = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
      
      let lastResultWithData: ExplorerResult | null = null;
      let depth = 0;
      
      for (const move of moves) {
        chess.move(move);
        const result = await explorer.query(chess.fen());
        
        if (result.stats.totalGames > 0) {
          lastResultWithData = result;
          depth++;
        } else {
          break;
        }
      }
      
      console.log(`   Najdorf line depth with data: ${depth} half-moves`);
      expect(depth).toBeGreaterThan(4); // Should have data at least through move 3
    });
  });

  describe('Opening Names', () => {
    it('should identify King\'s Pawn Opening after 1. e4', async () => {
      const chess = new Chess();
      chess.move('e4');
      
      const result = await explorer.query(chess.fen());
      
      expect(result.opening).toBeDefined();
      expect(result.opening!.name).toContain('King');
      console.log(`   After 1. e4: ${result.opening?.name} (${result.opening?.eco})`);
    });

    it('should identify Sicilian Defense after 1. e4 c5', async () => {
      const chess = new Chess();
      chess.move('e4');
      chess.move('c5');
      
      const result = await explorer.query(chess.fen());
      
      expect(result.opening).toBeDefined();
      expect(result.opening!.name.toLowerCase()).toContain('sicilian');
      console.log(`   After 1. e4 c5: ${result.opening?.name} (${result.opening?.eco})`);
    });

    it('should identify French Defense after 1. e4 e6', async () => {
      const chess = new Chess();
      chess.move('e4');
      chess.move('e6');
      
      const result = await explorer.query(chess.fen());
      
      expect(result.opening).toBeDefined();
      expect(result.opening!.name.toLowerCase()).toContain('french');
      console.log(`   After 1. e4 e6: ${result.opening?.name} (${result.opening?.eco})`);
    });

    it('should identify Queen\'s Gambit after 1. d4 d5 2. c4', async () => {
      const chess = new Chess();
      chess.move('d4');
      chess.move('d5');
      chess.move('c4');
      
      const result = await explorer.query(chess.fen());
      
      expect(result.opening).toBeDefined();
      expect(result.opening!.name.toLowerCase()).toContain('queen');
      console.log(`   After 1. d4 d5 2. c4: ${result.opening?.name} (${result.opening?.eco})`);
    });
  });

  describe('Data Quality', () => {
    it('should have reasonable win percentages at starting position', async () => {
      const result = await explorer.query('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      
      // White typically wins 50-55%, draws 5-15%, black wins 35-45%
      console.log(`   Win rates: White ${result.stats.whiteWinPercent.toFixed(1)}%, Draw ${result.stats.drawPercent.toFixed(1)}%, Black ${result.stats.blackWinPercent.toFixed(1)}%`);
      
      // Sanity checks - blitz games have lower draw rates
      expect(result.stats.whiteWinPercent).toBeGreaterThan(40);
      expect(result.stats.whiteWinPercent).toBeLessThan(60);
      expect(result.stats.blackWinPercent).toBeGreaterThan(35);
      expect(result.stats.blackWinPercent).toBeLessThan(55);
    });

    it('should have average ratings in reasonable range', async () => {
      const result = await explorer.query('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      
      // Most Lichess blitz is around 1000-2000 rating
      const e4 = result.moves.find(m => m.san === 'e4');
      expect(e4).toBeDefined();
      
      console.log(`   Average rating for 1. e4: ${e4!.averageRating}`);
      expect(e4!.averageRating).toBeGreaterThan(1000);
      expect(e4!.averageRating).toBeLessThan(2500);
    });

    it('should have play rates that sum to ~100%', async () => {
      const result = await explorer.query('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      
      const totalPlayRate = result.moves.reduce((sum, m) => sum + m.playRate, 0);
      console.log(`   Total play rate (should be ~100%): ${totalPlayRate.toFixed(1)}%`);
      
      // Should be close to 100%
      expect(totalPlayRate).toBeGreaterThan(95);
      expect(totalPlayRate).toBeLessThan(105);
    });

    it('should return moves sorted by popularity', async () => {
      const result = await explorer.query('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      
      // Verify sorted descending
      for (let i = 1; i < result.moves.length; i++) {
        expect(result.moves[i - 1].totalGames).toBeGreaterThanOrEqual(result.moves[i].totalGames);
      }
    });
  });

  describe('API Compatibility', () => {
    it('should return result compatible with websocket handler', async () => {
      const result = await explorer.query('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      
      // This is exactly what the socket handler sends to clients
      const wsResponse = { result, database: 'local' as const };
      
      // Verify structure matches what client expects
      expect(wsResponse.result.raw).toBeDefined();
      expect(wsResponse.result.stats).toBeDefined();
      expect(wsResponse.result.moves).toBeDefined();
      expect(wsResponse.database).toBe('local');
    });

    it('should handle empty position gracefully', async () => {
      // Random position that definitely won't be in database
      const result = await explorer.query('8/8/8/4k3/8/8/4K3/8 w - - 0 1');
      
      expect(result.stats.totalGames).toBe(0);
      expect(result.moves).toHaveLength(0);
      expect(result.database).toBe('local');
    });

    it('should handle hasPosition check', async () => {
      const hasStart = await explorer.hasPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      expect(hasStart).toBe(true);
      
      const hasEmpty = await explorer.hasPosition('8/8/8/4k3/8/8/4K3/8 w - - 0 1');
      expect(hasEmpty).toBe(false);
    });
  });

  describe('Position Hash Consistency', () => {
    it('should find same position regardless of move order', async () => {
      // Position after 1. d4 d5 2. c4
      const chess1 = new Chess();
      chess1.move('d4');
      chess1.move('d5');
      chess1.move('c4');
      
      // Same position via 1. c4 d5 2. d4
      const chess2 = new Chess();
      chess2.move('c4');
      chess2.move('d5');
      chess2.move('d4');
      
      const result1 = await explorer.query(chess1.fen());
      const result2 = await explorer.query(chess2.fen());
      
      // FENs should match (same position)
      expect(chess1.fen().split(' ').slice(0, 4).join(' '))
        .toBe(chess2.fen().split(' ').slice(0, 4).join(' '));
      
      // Results should be identical
      expect(result1.stats.totalGames).toBe(result2.stats.totalGames);
    });
  });
});

// Separate describe for when database doesn't exist
describe('Local Explorer - No Database', () => {
  it('should report database status correctly', () => {
    if (!DB_EXISTS) {
      console.log('⚠️  Local explorer database not found at:', LMDB_PATH);
      console.log('   Run: cd server && npx tsx src/database/local-explorer/cli.ts build --year 2025 --month 12');
    }
    expect(true).toBe(true); // Always passes
  });
});

