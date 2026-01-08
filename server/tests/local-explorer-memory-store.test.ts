/**
 * Memory Store Tests
 *
 * Verifies that:
 * 1. Position statistics are tracked correctly
 * 2. Move statistics are tracked correctly
 * 3. Batch writes work as expected
 * 4. Results are sorted by popularity
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../src/database/local-explorer/storage/memory-store.js';
import { hashFen, STARTING_POSITION_HASH } from '../src/database/local-explorer/index.js';
import type { GameResult, PositionUpdate } from '../src/database/local-explorer/types.js';

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  describe('incrementPosition', () => {
    it('should track white wins', async () => {
      await store.incrementPosition(STARTING_POSITION_HASH, 'white');
      await store.incrementPosition(STARTING_POSITION_HASH, 'white');

      const stats = await store.getPosition(STARTING_POSITION_HASH);
      expect(stats).toEqual({ white: 2, draws: 0, black: 0 });
    });

    it('should track black wins', async () => {
      await store.incrementPosition(STARTING_POSITION_HASH, 'black');
      await store.incrementPosition(STARTING_POSITION_HASH, 'black');
      await store.incrementPosition(STARTING_POSITION_HASH, 'black');

      const stats = await store.getPosition(STARTING_POSITION_HASH);
      expect(stats).toEqual({ white: 0, draws: 0, black: 3 });
    });

    it('should track draws', async () => {
      await store.incrementPosition(STARTING_POSITION_HASH, 'draw');

      const stats = await store.getPosition(STARTING_POSITION_HASH);
      expect(stats).toEqual({ white: 0, draws: 1, black: 0 });
    });

    it('should track mixed results', async () => {
      await store.incrementPosition(STARTING_POSITION_HASH, 'white');
      await store.incrementPosition(STARTING_POSITION_HASH, 'black');
      await store.incrementPosition(STARTING_POSITION_HASH, 'draw');
      await store.incrementPosition(STARTING_POSITION_HASH, 'white');

      const stats = await store.getPosition(STARTING_POSITION_HASH);
      expect(stats).toEqual({ white: 2, draws: 1, black: 1 });
    });

    it('should track multiple positions independently', async () => {
      const hash1 = hashFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
      const hash2 = hashFen('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1');

      await store.incrementPosition(hash1, 'white');
      await store.incrementPosition(hash2, 'black');

      expect(await store.getPosition(hash1)).toEqual({ white: 1, draws: 0, black: 0 });
      expect(await store.getPosition(hash2)).toEqual({ white: 0, draws: 0, black: 1 });
    });
  });

  describe('incrementMove', () => {
    it('should track move statistics', async () => {
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white', 2000);
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'draw', 2100);
      await store.incrementMove(STARTING_POSITION_HASH, 'd2d4', 'black', 2200);

      const moves = await store.getMoves(STARTING_POSITION_HASH);

      expect(moves).toHaveLength(2);

      const e4Move = moves.find(m => m.uci === 'e2e4');
      expect(e4Move).toBeDefined();
      expect(e4Move?.white).toBe(1);
      expect(e4Move?.draws).toBe(1);
      expect(e4Move?.black).toBe(0);
      expect(e4Move?.games).toBe(2);
      expect(e4Move?.ratingSum).toBe(4100);

      const d4Move = moves.find(m => m.uci === 'd2d4');
      expect(d4Move).toBeDefined();
      expect(d4Move?.black).toBe(1);
      expect(d4Move?.games).toBe(1);
    });

    it('should sort moves by popularity', async () => {
      // Add moves with different frequencies
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'd2d4', 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'd2d4', 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'c2c4', 'white');

      const moves = await store.getMoves(STARTING_POSITION_HASH);

      expect(moves[0].uci).toBe('e2e4'); // Most popular
      expect(moves[1].uci).toBe('d2d4'); // Second most
      expect(moves[2].uci).toBe('c2c4'); // Least popular
    });

    it('should handle moves without ratings', async () => {
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'draw');

      const moves = await store.getMoves(STARTING_POSITION_HASH);
      const e4Move = moves.find(m => m.uci === 'e2e4');

      expect(e4Move?.ratingSum).toBe(0);
      expect(e4Move?.games).toBe(2);
    });
  });

  describe('batchWrite', () => {
    it('should process multiple updates at once', async () => {
      const hash1 = STARTING_POSITION_HASH;
      const hash2 = hashFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');

      const updates: PositionUpdate[] = [
        { hash: hash1, move: 'e2e4', result: 'white', rating: 2000 },
        { hash: hash2, move: 'e7e5', result: 'white', rating: 2000 },
        { hash: hash1, move: 'e2e4', result: 'draw', rating: 2100 },
        { hash: hash1, move: 'd2d4', result: 'black', rating: 1900 },
      ];

      await store.batchWrite(updates);

      const stats1 = await store.getPosition(hash1);
      expect(stats1).toEqual({ white: 1, draws: 1, black: 1 });

      const stats2 = await store.getPosition(hash2);
      expect(stats2).toEqual({ white: 1, draws: 0, black: 0 });

      const moves1 = await store.getMoves(hash1);
      expect(moves1).toHaveLength(2);
    });
  });

  describe('hasPosition', () => {
    it('should return true for existing positions', async () => {
      await store.incrementPosition(STARTING_POSITION_HASH, 'white');
      expect(await store.hasPosition(STARTING_POSITION_HASH)).toBe(true);
    });

    it('should return false for non-existing positions', async () => {
      expect(await store.hasPosition(12345n)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'd2d4', 'black');

      const hash2 = hashFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
      await store.incrementMove(hash2, 'e7e5', 'draw');

      const stats = await store.getStats();

      expect(stats.positionCount).toBe(2);
      expect(stats.moveCount).toBe(3);
      expect(stats.sizeBytes).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should remove all data', async () => {
      await store.incrementPosition(STARTING_POSITION_HASH, 'white');
      await store.incrementMove(STARTING_POSITION_HASH, 'e2e4', 'white');

      store.clear();

      expect(await store.hasPosition(STARTING_POSITION_HASH)).toBe(false);
      const stats = await store.getStats();
      expect(stats.positionCount).toBe(0);
      expect(stats.moveCount).toBe(0);
    });
  });
});


