/**
 * Local Explorer API Tests
 * 
 * Tests the API layer that will be exposed to the websocket server.
 * Focuses on:
 * 1. Request/response format
 * 2. Error handling
 * 3. Status reporting
 * 4. Query parameters
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LocalExplorer,
  createLocalExplorer,
} from '../src/database/local-explorer/index.js';
import type { 
  ExplorerResult, 
  ExplorerStatus, 
  LichessDatabase 
} from '@chess/shared';

// Real database path - server/data folder
const __dirname = dirname(fileURLToPath(import.meta.url));
const LMDB_PATH = join(__dirname, '..', 'data', 'opening-explorer.lmdb');
const DB_EXISTS = existsSync(LMDB_PATH);

const describeIfDb = DB_EXISTS ? describe : describe.skip;

describeIfDb('Local Explorer API', () => {
  let explorer: LocalExplorer;

  beforeAll(async () => {
    explorer = await createLocalExplorer(LMDB_PATH);
  });

  afterAll(async () => {
    await explorer.close();
  });

  describe('Query Interface', () => {
    it('should accept FEN string and return ExplorerResult', async () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const result: ExplorerResult = await explorer.query(fen);
      
      // Type check passes if this compiles
      expect(result.stats.totalGames).toBeGreaterThan(0);
      expect(result.moves.length).toBeGreaterThan(0);
    });

    it('should accept limit option', async () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      
      const result5 = await explorer.query(fen, { limit: 5 });
      const result10 = await explorer.query(fen, { limit: 10 });
      
      expect(result5.moves.length).toBeLessThanOrEqual(5);
      expect(result10.moves.length).toBeLessThanOrEqual(10);
      expect(result10.moves.length).toBeGreaterThan(result5.moves.length);
    });

    it('should default to 12 moves without limit', async () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const result = await explorer.query(fen);
      
      // Default limit is 12
      expect(result.moves.length).toBeLessThanOrEqual(12);
    });
  });

  describe('Status Interface', () => {
    it('should return database statistics', async () => {
      const stats = await explorer.getStats();
      
      expect(stats).toHaveProperty('positionCount');
      expect(stats).toHaveProperty('moveCount');
      expect(stats.positionCount).toBeGreaterThan(0);
      expect(stats.moveCount).toBeGreaterThan(0);
    });

    it('should check position existence', async () => {
      const hasStart = await explorer.hasPosition(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );
      expect(hasStart).toBe(true);
    });
  });

  describe('Response Format for Socket', () => {
    /**
     * Simulates the socket handler response format
     */
    interface SocketResponse {
      result: ExplorerResult;
      database: LichessDatabase;
    }

    it('should produce valid socket response format', async () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const result = await explorer.query(fen);
      
      // This is exactly how socket handler packages the response
      const response: SocketResponse = {
        result,
        database: 'local',
      };
      
      // Client expects these fields
      expect(response.result.raw).toBeDefined();
      expect(response.result.raw.white).toBeGreaterThanOrEqual(0);
      expect(response.result.raw.draws).toBeGreaterThanOrEqual(0);
      expect(response.result.raw.black).toBeGreaterThanOrEqual(0);
      expect(response.result.raw.moves).toBeDefined();
      expect(response.result.raw.topGames).toBeDefined();
      
      expect(response.result.stats).toBeDefined();
      expect(response.result.stats.totalGames).toBeGreaterThanOrEqual(0);
      expect(response.result.stats.whiteWinPercent).toBeGreaterThanOrEqual(0);
      expect(response.result.stats.drawPercent).toBeGreaterThanOrEqual(0);
      expect(response.result.stats.blackWinPercent).toBeGreaterThanOrEqual(0);
      
      expect(response.result.moves).toBeDefined();
      expect(Array.isArray(response.result.moves)).toBe(true);
      
      expect(response.database).toBe('local');
    });

    it('should match raw response to stats', async () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const result = await explorer.query(fen);
      
      const rawTotal = result.raw.white + result.raw.draws + result.raw.black;
      expect(result.stats.totalGames).toBe(rawTotal);
    });

    it('should include opening info when available', async () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
      const result = await explorer.query(fen);
      
      expect(result.opening).toBeDefined();
      expect(result.opening).toHaveProperty('eco');
      expect(result.opening).toHaveProperty('name');
      
      // Should also be in raw response
      expect(result.raw.opening).toEqual(result.opening);
    });
  });

  describe('ExplorerStatus Format', () => {
    it('should produce valid status for socket', async () => {
      const stats = await explorer.getStats();
      
      // This is how socket handler builds status
      const status: ExplorerStatus = {
        localAvailable: true,
        localPositionCount: stats.positionCount,
        localGameCount: stats.moveCount,
      };
      
      expect(status.localAvailable).toBe(true);
      expect(status.localPositionCount).toBeGreaterThan(0);
      expect(status.localGameCount).toBeGreaterThan(0);
    });
  });

  describe('Move Statistics Format', () => {
    it('should return all required move fields', async () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const result = await explorer.query(fen);
      
      const move = result.moves[0];
      
      // Required fields for UI
      expect(move).toHaveProperty('uci');
      expect(move).toHaveProperty('san');
      expect(move).toHaveProperty('white');
      expect(move).toHaveProperty('draws');
      expect(move).toHaveProperty('black');
      expect(move).toHaveProperty('averageRating');
      expect(move).toHaveProperty('totalGames');
      expect(move).toHaveProperty('playRate');
      expect(move).toHaveProperty('whiteWinPercent');
      expect(move).toHaveProperty('drawPercent');
      expect(move).toHaveProperty('blackWinPercent');
      
      // Types should be correct
      expect(typeof move.uci).toBe('string');
      expect(typeof move.san).toBe('string');
      expect(typeof move.white).toBe('number');
      expect(typeof move.draws).toBe('number');
      expect(typeof move.black).toBe('number');
      expect(typeof move.averageRating).toBe('number');
      expect(typeof move.totalGames).toBe('number');
      expect(typeof move.playRate).toBe('number');
      expect(typeof move.whiteWinPercent).toBe('number');
      expect(typeof move.drawPercent).toBe('number');
      expect(typeof move.blackWinPercent).toBe('number');
    });

    it('should calculate derived fields correctly', async () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const result = await explorer.query(fen);
      
      for (const move of result.moves) {
        // totalGames should be sum of results
        expect(move.totalGames).toBe(move.white + move.draws + move.black);
        
        // Percentages should be calculated correctly
        if (move.totalGames > 0) {
          expect(move.whiteWinPercent).toBeCloseTo((move.white / move.totalGames) * 100, 5);
          expect(move.drawPercent).toBeCloseTo((move.draws / move.totalGames) * 100, 5);
          expect(move.blackWinPercent).toBeCloseTo((move.black / move.totalGames) * 100, 5);
        }
        
        // Play rate should be relative to position total
        const positionTotal = result.stats.totalGames;
        if (positionTotal > 0) {
          expect(move.playRate).toBeCloseTo((move.totalGames / positionTotal) * 100, 5);
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed FEN gracefully', async () => {
      // Invalid FEN should return empty result, not throw
      const result = await explorer.query('not a valid fen');
      
      // Should return empty result structure
      expect(result.stats.totalGames).toBe(0);
      expect(result.moves).toHaveLength(0);
    });

    it('should handle position not in database', async () => {
      // Deep endgame position
      const result = await explorer.query('8/8/4k3/8/8/4K3/8/8 w - - 0 1');
      
      expect(result.stats.totalGames).toBe(0);
      expect(result.moves).toHaveLength(0);
      expect(result.database).toBe('local');
    });
  });
});

describe('Local Explorer API - Factory Function', () => {
  const describeIfDb = DB_EXISTS ? describe : describe.skip;
  
  describeIfDb('createLocalExplorer', () => {
    it('should create explorer with string path', async () => {
      const explorer = await createLocalExplorer(LMDB_PATH);
      expect(explorer).toBeInstanceOf(LocalExplorer);
      
      const stats = await explorer.getStats();
      expect(stats.positionCount).toBeGreaterThan(0);
      
      await explorer.close();
    });

    it('should create explorer with config object', async () => {
      const explorer = await createLocalExplorer({
        dbPath: LMDB_PATH,
      });
      expect(explorer).toBeInstanceOf(LocalExplorer);
      
      await explorer.close();
    });
  });
});

