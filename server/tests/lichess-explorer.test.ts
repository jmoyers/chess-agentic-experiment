/**
 * Tests for Lichess Opening Explorer Library
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpeningExplorer,
  queryMasters,
  queryLichess,
  queryPlayer,
  STARTING_FEN,
  DEFAULT_FILTERS,
} from '../src/database/lichess/index.js';
import type { LichessExplorerResponse } from '@chess/shared';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Sample API responses based on real Lichess data
const SAMPLE_MASTERS_RESPONSE: LichessExplorerResponse = {
  white: 411138,
  draws: 549971,
  black: 287766,
  opening: { eco: 'A00', name: 'Start' },
  moves: [
    {
      uci: 'e2e4',
      san: 'e4',
      averageRating: 2469,
      white: 174070,
      draws: 209368,
      black: 119318,
      opening: { eco: 'B00', name: "King's Pawn Game" },
    },
    {
      uci: 'd2d4',
      san: 'd4',
      averageRating: 2472,
      white: 158877,
      draws: 227889,
      black: 111946,
      opening: { eco: 'A40', name: "Queen's Pawn Game" },
    },
    {
      uci: 'g1f3',
      san: 'Nf3',
      averageRating: 2469,
      white: 49115,
      draws: 71827,
      black: 36217,
      opening: { eco: 'A04', name: "Zukertort Opening" },
    },
  ],
  topGames: [
    {
      id: 'abc123',
      white: { name: 'Carlsen, Magnus', rating: 2882 },
      black: { name: 'Caruana, Fabiano', rating: 2818 },
      winner: null,
      year: 2024,
      month: 8,
    },
  ],
};

const SAMPLE_LICHESS_RESPONSE: LichessExplorerResponse = {
  white: 5234567,
  draws: 3456789,
  black: 4567890,
  opening: { eco: 'A00', name: 'Start' },
  moves: [
    {
      uci: 'e2e4',
      san: 'e4',
      averageRating: 2156,
      white: 2345678,
      draws: 1234567,
      black: 1567890,
      opening: { eco: 'B00', name: "King's Pawn Game" },
    },
    {
      uci: 'd2d4',
      san: 'd4',
      averageRating: 2189,
      white: 1987654,
      draws: 1567890,
      black: 1234567,
      opening: { eco: 'A40', name: "Queen's Pawn Game" },
    },
  ],
  topGames: [],
  recentGames: [],
};

describe('Lichess Opening Explorer Library', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Low-level API functions', () => {
    describe('queryMasters', () => {
      it('should query the masters database', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_MASTERS_RESPONSE),
        });

        const result = await queryMasters({ fen: STARTING_FEN });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('https://explorer.lichess.ovh/masters'),
          expect.objectContaining({ headers: { Accept: 'application/json' } })
        );
        expect(result.white).toBe(411138);
        expect(result.moves).toHaveLength(3);
        expect(result.moves[0].san).toBe('e4');
      });

      it('should include since/until parameters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_MASTERS_RESPONSE),
        });

        await queryMasters({ fen: STARTING_FEN, since: 2000, until: 2024 });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/since=2000/),
          expect.any(Object)
        );
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/until=2024/),
          expect.any(Object)
        );
      });

      it('should return empty response for 404', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });

        const result = await queryMasters({ fen: 'invalid/fen' });

        expect(result.white).toBe(0);
        expect(result.moves).toHaveLength(0);
      });

      it('should throw on rate limit', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        });

        await expect(queryMasters({ fen: STARTING_FEN })).rejects.toThrow(/Rate limited/);
      });
    });

    describe('queryLichess', () => {
      it('should query the lichess database with filters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_LICHESS_RESPONSE),
        });

        const result = await queryLichess({
          fen: STARTING_FEN,
          speeds: ['rapid', 'classical'],
          ratings: [2000, 2200, 2500],
        });

        // URL encodes commas as %2C
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/speeds=rapid%2Cclassical/),
          expect.any(Object)
        );
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/ratings=2000%2C2200%2C2500/),
          expect.any(Object)
        );
        expect(result.white).toBe(5234567);
      });
    });

    describe('queryPlayer', () => {
      it('should query a specific player', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_LICHESS_RESPONSE),
        });

        await queryPlayer({
          fen: STARTING_FEN,
          player: 'DrNykterstein',
          color: 'white',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/player=DrNykterstein/),
          expect.any(Object)
        );
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/color=white/),
          expect.any(Object)
        );
      });
    });
  });

  describe('OpeningExplorer class', () => {
    let explorer: OpeningExplorer;

    beforeEach(() => {
      explorer = new OpeningExplorer();
    });

    describe('masters()', () => {
      it('should return explorer result with computed stats', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_MASTERS_RESPONSE),
        });

        const result = await explorer.masters(STARTING_FEN);

        expect(result.database).toBe('masters');
        expect(result.stats.totalGames).toBe(1248875); // white + draws + black
        expect(result.stats.whiteWinPercent).toBeCloseTo(32.9, 1);
        expect(result.stats.drawPercent).toBeCloseTo(44.0, 1);
        expect(result.stats.blackWinPercent).toBeCloseTo(23.0, 1);
        expect(result.moves).toHaveLength(3);
        expect(result.moves[0].san).toBe('e4'); // sorted by popularity
      });

      it('should compute move statistics correctly', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_MASTERS_RESPONSE),
        });

        const result = await explorer.masters(STARTING_FEN);
        const e4Move = result.moves[0];

        expect(e4Move.totalGames).toBe(502756); // 174070 + 209368 + 119318
        expect(e4Move.playRate).toBeCloseTo(40.3, 1); // percentage of total position games
        expect(e4Move.whiteWinPercent).toBeCloseTo(34.6, 1);
        expect(e4Move.averageRating).toBe(2469);
      });

      it('should cache responses', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(SAMPLE_MASTERS_RESPONSE),
        });

        // First call
        await explorer.masters(STARTING_FEN);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Second call - should use cache
        await explorer.masters(STARTING_FEN);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Different FEN - should make new request
        await explorer.masters('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should include opening info if available', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_MASTERS_RESPONSE),
        });

        const result = await explorer.masters(STARTING_FEN);

        expect(result.opening).toBeDefined();
        expect(result.opening?.eco).toBe('A00');
        expect(result.opening?.name).toBe('Start');
      });
    });

    describe('lichess()', () => {
      it('should use default filters when none specified', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_LICHESS_RESPONSE),
        });

        await explorer.lichess(STARTING_FEN);

        // Should use DEFAULT_FILTERS.competitive (URL encodes commas as %2C)
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/speeds=rapid%2Cclassical/),
          expect.any(Object)
        );
      });

      it('should allow overriding default filters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_LICHESS_RESPONSE),
        });

        await explorer.lichess(STARTING_FEN, {
          speeds: ['bullet'],
          ratings: [1600, 1800],
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/speeds=bullet/),
          expect.any(Object)
        );
      });
    });

    describe('explore()', () => {
      it('should use default database', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_MASTERS_RESPONSE),
        });

        const result = await explorer.explore(STARTING_FEN);

        expect(result.database).toBe('masters');
      });

      it('should allow specifying database', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(SAMPLE_LICHESS_RESPONSE),
        });

        const result = await explorer.explore(STARTING_FEN, { database: 'lichess' });

        expect(result.database).toBe('lichess');
      });

      it('should require player name for player database', async () => {
        await expect(explorer.explore(STARTING_FEN, { database: 'player' })).rejects.toThrow(
          /Player name required/
        );
      });
    });

    describe('caching', () => {
      it('should respect cache TTL', async () => {
        // Create explorer with very short TTL
        const shortTtlExplorer = new OpeningExplorer({ cacheTtl: 10 });

        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(SAMPLE_MASTERS_RESPONSE),
        });

        // First call
        await shortTtlExplorer.masters(STARTING_FEN);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Wait for cache to expire
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Should make new request
        await shortTtlExplorer.masters(STARTING_FEN);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should report cache stats', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(SAMPLE_MASTERS_RESPONSE),
        });

        expect(explorer.getCacheStats().size).toBe(0);

        await explorer.masters(STARTING_FEN);
        expect(explorer.getCacheStats().size).toBe(1);

        await explorer.masters('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
        expect(explorer.getCacheStats().size).toBe(2);
      });

      it('should clear cache', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(SAMPLE_MASTERS_RESPONSE),
        });

        await explorer.masters(STARTING_FEN);
        expect(explorer.getCacheStats().size).toBe(1);

        explorer.clearCache();
        expect(explorer.getCacheStats().size).toBe(0);
      });
    });
  });

  describe('DEFAULT_FILTERS', () => {
    it('should have competitive preset', () => {
      expect(DEFAULT_FILTERS.competitive.speeds).toContain('rapid');
      expect(DEFAULT_FILTERS.competitive.speeds).toContain('classical');
      expect(DEFAULT_FILTERS.competitive.ratings).toContain(2000);
    });

    it('should have elite preset', () => {
      expect(DEFAULT_FILTERS.elite.ratings).toEqual([2500]);
    });

    it('should have all preset covering all options', () => {
      expect(DEFAULT_FILTERS.all.speeds).toHaveLength(6);
      expect(DEFAULT_FILTERS.all.ratings).toHaveLength(9);
    });
  });

  describe('STARTING_FEN', () => {
    it('should be the standard starting position', () => {
      expect(STARTING_FEN).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    });
  });
});

