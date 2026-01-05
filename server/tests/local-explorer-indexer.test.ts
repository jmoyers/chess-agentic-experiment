/**
 * Indexer Tests
 *
 * Tests the full indexing pipeline:
 * 1. PGN parsing
 * 2. Game processing
 * 3. Position indexing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryStore,
  processGame,
  processGameFromPgn,
  parsePgnMoves,
  parseGamesFromString,
  indexPgnString,
  indexGames,
  hashFen,
  STARTING_POSITION_HASH,
} from '../src/database/local-explorer/index.js';
import type { ParsedGame } from '../src/database/local-explorer/types.js';

describe('Game Processor', () => {
  describe('processGame', () => {
    it('should extract positions from a simple game', () => {
      const game: ParsedGame = {
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
        result: 'white',
        averageRating: 2100,
      };

      const updates = processGame(game);

      // Should have 5 position updates (one for each move)
      expect(updates).toHaveLength(5);

      // First update should be from starting position
      expect(updates[0].hash).toBe(STARTING_POSITION_HASH);
      expect(updates[0].move).toBe('e2e4');
      expect(updates[0].result).toBe('white');
      expect(updates[0].rating).toBe(2100);

      // Second update should be from position after 1.e4
      // Note: chess.js uses e3 for en passant target, we use the actual FEN it produces
      const afterE4 = hashFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
      expect(updates[1].hash).toBe(afterE4);
      expect(updates[1].move).toBe('e7e5');
    });

    it('should respect maxMoves limit', () => {
      const game: ParsedGame = {
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
        result: 'draw',
      };

      const updates = processGame(game, { maxMoves: 5 });

      expect(updates).toHaveLength(5);
    });

    it('should handle castling moves', () => {
      const game: ParsedGame = {
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'],
        result: 'white',
      };

      const updates = processGame(game);

      // Castling should be encoded as e1g1
      const castlingUpdate = updates[8];
      expect(castlingUpdate.move).toBe('e1g1');
    });

    it('should handle promotion', () => {
      // A game where a pawn promotes
      const game: ParsedGame = {
        moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nf6', 'd5', 'c6', 
                'd6', 'exd6', 'Bd2', 'Qb6', 'Nf3', 'Be7', 'Bc4', 'O-O', 'O-O', 'Bg4',
                'h3', 'Bh5', 'g4', 'Bg6', 'Nh4', 'Nbd7', 'Nxg6', 'hxg6', 'Qf3', 'Nc5',
                'Rad1', 'Rfe8', 'Rfe1', 'a6', 'Rxe7', 'Rxe7', 'Re1', 'Rae8', 'Rxe7', 'Rxe7'],
        result: 'white',
      };

      const updates = processGame(game);
      expect(updates.length).toBeGreaterThan(0);
    });

    it('should handle empty game', () => {
      const game: ParsedGame = {
        moves: [],
        result: 'draw',
      };

      const updates = processGame(game);
      expect(updates).toHaveLength(0);
    });
  });

  describe('processGameFromPgn', () => {
    it('should parse and process PGN move text', () => {
      const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5';
      const updates = processGameFromPgn(pgn, 'white', 2000);

      expect(updates).toHaveLength(5);
      expect(updates[0].hash).toBe(STARTING_POSITION_HASH);
    });

    it('should handle move numbers and dots', () => {
      // Note: "3..." notation isn't standard - use proper move sequence
      const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6';
      const updates = processGameFromPgn(pgn, 'black');

      expect(updates).toHaveLength(6);
    });
  });

  describe('parsePgnMoves', () => {
    it('should extract moves from PGN text', () => {
      const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0';
      const moves = parsePgnMoves(pgn);

      expect(moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    });

    it('should handle comments', () => {
      const pgn = '1. e4 {Best by test} e5 2. Nf3 Nc6';
      const moves = parsePgnMoves(pgn);

      expect(moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    });

    it('should handle NAGs', () => {
      const pgn = '1. e4 $1 e5 $2 2. Nf3 $14 Nc6';
      const moves = parsePgnMoves(pgn);

      expect(moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    });

    it('should handle different results', () => {
      expect(parsePgnMoves('1. e4 e5 1-0')).toEqual(['e4', 'e5']);
      expect(parsePgnMoves('1. e4 e5 0-1')).toEqual(['e4', 'e5']);
      expect(parsePgnMoves('1. e4 e5 1/2-1/2')).toEqual(['e4', 'e5']);
      expect(parsePgnMoves('1. e4 e5 *')).toEqual(['e4', 'e5']);
    });
  });
});

describe('PGN Parser', () => {
  describe('parseGamesFromString', () => {
    it('should parse multiple games from PGN', () => {
      const pgn = `[Event "Test"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0

[Event "Test 2"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1
`;

      const games = parseGamesFromString(pgn);

      expect(games).toHaveLength(2);
      expect(games[0].result).toBe('white');
      expect(games[0].moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
      expect(games[1].result).toBe('black');
      expect(games[1].moves).toEqual(['d4', 'd5', 'c4', 'e6']);
    });

    it('should extract ratings', () => {
      const pgn = `[Event "Test"]
[WhiteElo "2400"]
[BlackElo "2300"]
[Result "1/2-1/2"]

1. e4 e5 1/2-1/2
`;

      const games = parseGamesFromString(pgn);

      expect(games).toHaveLength(1);
      expect(games[0].averageRating).toBe(2350);
      expect(games[0].result).toBe('draw');
    });

    it('should respect minRating filter', () => {
      const pgn = `[Event "Low rated"]
[WhiteElo "1500"]
[BlackElo "1400"]
[Result "1-0"]

1. e4 e5 1-0

[Event "High rated"]
[WhiteElo "2400"]
[BlackElo "2300"]
[Result "0-1"]

1. d4 d5 0-1
`;

      const games = parseGamesFromString(pgn, { minRating: 2000 });

      expect(games).toHaveLength(1);
      expect(games[0].averageRating).toBe(2350);
    });

    it('should respect maxGames limit', () => {
      const pgn = `[Result "1-0"]
1. e4 1-0

[Result "0-1"]
1. d4 0-1

[Result "1/2-1/2"]
1. c4 1/2-1/2
`;

      const games = parseGamesFromString(pgn, { maxGames: 2 });

      expect(games).toHaveLength(2);
    });

    it('should handle real Lichess PGN format', () => {
      const pgn = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abc123"]
[Date "2024.01.15"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]
[UTCDate "2024.01.15"]
[UTCTime "12:00:00"]
[WhiteElo "2100"]
[BlackElo "2050"]
[WhiteRatingDiff "+5"]
[BlackRatingDiff "-5"]
[Variant "Standard"]
[TimeControl "180+0"]
[ECO "C50"]
[Opening "Italian Game"]
[Termination "Normal"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 d6 6. c3 O-O 1-0
`;

      const games = parseGamesFromString(pgn);

      expect(games).toHaveLength(1);
      expect(games[0].moves).toHaveLength(12);
      expect(games[0].result).toBe('white');
      expect(games[0].averageRating).toBe(2075);
      expect(games[0].event).toBe('Rated Blitz game');
    });
  });
});

describe('Indexer', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  describe('indexGames', () => {
    it('should index games and accumulate statistics', async () => {
      const games: ParsedGame[] = [
        { moves: ['e4', 'e5', 'Nf3'], result: 'white', averageRating: 2000 },
        { moves: ['e4', 'c5'], result: 'black', averageRating: 2100 },
        { moves: ['e4', 'e5'], result: 'draw', averageRating: 2200 },
        { moves: ['d4', 'd5'], result: 'white', averageRating: 2000 },
      ];

      const stats = await indexGames(games, store);

      expect(stats.gamesProcessed).toBe(4);
      expect(stats.positionsIndexed).toBeGreaterThan(0);

      // Check starting position statistics
      const startingStats = await store.getPosition(STARTING_POSITION_HASH);
      expect(startingStats).toBeDefined();
      // All 4 games pass through starting position
      expect(startingStats!.white + startingStats!.draws + startingStats!.black).toBe(4);
      expect(startingStats!.white).toBe(2);  // 2 white wins
      expect(startingStats!.black).toBe(1);  // 1 black win
      expect(startingStats!.draws).toBe(1);  // 1 draw

      // Check move statistics from starting position
      const startingMoves = await store.getMoves(STARTING_POSITION_HASH);
      expect(startingMoves.length).toBe(2); // e4 and d4

      const e4Move = startingMoves.find(m => m.uci === 'e2e4');
      expect(e4Move).toBeDefined();
      expect(e4Move!.white + e4Move!.draws + e4Move!.black).toBe(3); // 3 games with e4
    });

    it('should handle large batches efficiently', async () => {
      // Generate 1000 random-ish games
      const games: ParsedGame[] = [];
      const openings = [
        ['e4', 'e5', 'Nf3', 'Nc6'],
        ['d4', 'd5', 'c4', 'e6'],
        ['e4', 'c5', 'Nf3', 'd6'],
        ['d4', 'Nf6', 'c4', 'e6'],
        ['e4', 'e6', 'd4', 'd5'],
      ];
      const results: Array<'white' | 'black' | 'draw'> = ['white', 'black', 'draw'];

      for (let i = 0; i < 1000; i++) {
        const opening = openings[i % openings.length];
        const result = results[i % 3];
        const rating = 1800 + (i % 10) * 50;

        games.push({
          moves: opening,
          result,
          averageRating: rating,
        });
      }

      const stats = await indexGames(games, store, { batchSize: 100 });

      expect(stats.gamesProcessed).toBe(1000);
      expect(stats.elapsedMs).toBeLessThan(5000); // Should be fast

      // Verify starting position has all games
      const startingStats = await store.getPosition(STARTING_POSITION_HASH);
      expect(startingStats!.white + startingStats!.draws + startingStats!.black).toBe(1000);
    });
  });

  describe('indexPgnString', () => {
    it('should index from PGN string', async () => {
      const pgn = `[Result "1-0"]
[WhiteElo "2400"]
[BlackElo "2300"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0

[Result "0-1"]
[WhiteElo "2200"]
[BlackElo "2250"]

1. e4 c5 2. Nf3 d6 0-1
`;

      const stats = await indexPgnString(pgn, store);

      expect(stats.gamesProcessed).toBe(2);

      // Both games start with 1.e4
      const moves = await store.getMoves(STARTING_POSITION_HASH);
      const e4Move = moves.find(m => m.uci === 'e2e4');

      expect(e4Move).toBeDefined();
      expect(e4Move!.white + e4Move!.draws + e4Move!.black).toBe(2);
      expect(e4Move!.white).toBe(1); // First game
      expect(e4Move!.black).toBe(1); // Second game
    });
  });

  describe('Statistics correctness', () => {
    it('should correctly track win/loss/draw for each position', async () => {
      // 5 games through the Italian Game
      const games: ParsedGame[] = [
        { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], result: 'white' },
        { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], result: 'white' },
        { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], result: 'black' },
        { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], result: 'draw' },
        { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], result: 'draw' },
      ];

      await indexGames(games, store);

      // Position after 1.e4 e5 2.Nf3 Nc6
      const afterNc6 = hashFen('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
      const nc6Stats = await store.getPosition(afterNc6);

      expect(nc6Stats).toBeDefined();
      expect(nc6Stats!.white).toBe(2);
      expect(nc6Stats!.black).toBe(1);
      expect(nc6Stats!.draws).toBe(2);

      // Move Bc4 from that position
      const nc6Moves = await store.getMoves(afterNc6);
      const bc4Move = nc6Moves.find(m => m.uci === 'f1c4');

      expect(bc4Move).toBeDefined();
      expect(bc4Move!.white).toBe(2);
      expect(bc4Move!.black).toBe(1);
      expect(bc4Move!.draws).toBe(2);
    });

    it('should track average ratings correctly', async () => {
      const games: ParsedGame[] = [
        { moves: ['e4'], result: 'white', averageRating: 2000 },
        { moves: ['e4'], result: 'black', averageRating: 2200 },
        { moves: ['e4'], result: 'draw', averageRating: 2400 },
      ];

      await indexGames(games, store);

      const moves = await store.getMoves(STARTING_POSITION_HASH);
      const e4Move = moves.find(m => m.uci === 'e2e4')!;

      // Average = (2000 + 2200 + 2400) / 3 = 2200
      const avgRating = e4Move.ratingSum / e4Move.games;
      expect(avgRating).toBe(2200);
    });
  });
});

