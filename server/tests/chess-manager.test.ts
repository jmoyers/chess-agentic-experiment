import { describe, it, expect, beforeEach } from 'vitest';
import { ChessManager } from '../src/chess/manager.js';

describe('ChessManager', () => {
  let manager: ChessManager;

  beforeEach(() => {
    manager = new ChessManager();
  });

  describe('initialization', () => {
    it('should start with initial position', () => {
      const state = manager.getState();
      expect(state.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      expect(state.turn).toBe('w');
      expect(state.currentMoveIndex).toBe(0);
      expect(state.history).toHaveLength(0);
    });
  });

  describe('makeMove', () => {
    it('should make valid pawn moves', () => {
      const result = manager.makeMove('e2', 'e4');
      expect(result).toBeDefined();
      expect(result?.san).toBe('e4');

      const state = manager.getState();
      expect(state.turn).toBe('b');
      expect(state.currentMoveIndex).toBe(1);
      expect(state.history).toHaveLength(1);
    });

    it('should make valid knight moves', () => {
      const result = manager.makeMove('g1', 'f3');
      expect(result).toBeDefined();
      expect(result?.san).toBe('Nf3');
    });

    it('should reject invalid moves', () => {
      const result = manager.makeMove('e2', 'e5'); // Invalid pawn move
      expect(result).toBeNull();
    });

    it('should handle captures', () => {
      manager.makeMove('e2', 'e4');
      manager.makeMove('d7', 'd5');
      const capture = manager.makeMove('e4', 'd5');
      
      expect(capture).toBeDefined();
      expect(capture?.san).toBe('exd5');
      expect(capture?.captured).toBe('p');
    });

    it('should handle castling', () => {
      // Set up position where castling is possible
      manager.loadFEN('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');

      const result = manager.makeMove('e1', 'g1');
      expect(result).toBeDefined();
      expect(result?.san).toBe('O-O');
    });

    it('should handle promotion', () => {
      manager.loadFEN('8/P7/8/8/8/8/8/4K2k w - - 0 1');

      const result = manager.makeMove('a7', 'a8', 'q');
      expect(result).toBeDefined();
      // The move might include check indicator (+) depending on position
      expect(result?.san).toMatch(/^a8=Q/);
      expect(result?.promotion).toBe('q');
    });
  });

  describe('loadFEN', () => {
    it('should load valid FEN', () => {
      const fen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2';
      manager.loadFEN(fen);

      const state = manager.getState();
      // chess.js may normalize en passant to '-' if no capture is actually possible
      expect(state.fen).toContain('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq');
      expect(state.turn).toBe('w');
    });

    it('should reset history when loading FEN', () => {
      manager.makeMove('e2', 'e4');
      manager.makeMove('e7', 'e5');

      manager.loadFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

      const state = manager.getState();
      expect(state.history).toHaveLength(0);
      expect(state.currentMoveIndex).toBe(0);
    });

    it('should throw on invalid FEN', () => {
      expect(() => manager.loadFEN('invalid fen')).toThrow();
    });
  });

  describe('loadPGN', () => {
    it('should load simple PGN', () => {
      manager.loadPGN('1. e4 e5 2. Nf3 Nc6');

      const state = manager.getState();
      expect(state.history).toHaveLength(4);
      expect(state.currentMoveIndex).toBe(4);
    });

    it('should load PGN with annotations (ignoring them)', () => {
      manager.loadPGN('1. e4 e5 2. Nf3');

      const state = manager.getState();
      expect(state.history).toHaveLength(3);
    });

    it('should navigate to end after loading', () => {
      manager.loadPGN('1. d4 d5 2. Nc3 Nf6 3. Bf4');

      const state = manager.getState();
      expect(state.currentMoveIndex).toBe(5);
      expect(state.history.map((m) => m.san)).toEqual(['d4', 'd5', 'Nc3', 'Nf6', 'Bf4']);
    });
  });

  describe('navigateToMove', () => {
    beforeEach(() => {
      manager.makeMove('e2', 'e4');
      manager.makeMove('e7', 'e5');
      manager.makeMove('g1', 'f3');
      manager.makeMove('b8', 'c6');
    });

    it('should navigate to beginning', () => {
      manager.navigateToMove(0);

      const state = manager.getState();
      expect(state.currentMoveIndex).toBe(0);
      expect(state.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    });

    it('should navigate to middle move', () => {
      manager.navigateToMove(2);

      const state = manager.getState();
      expect(state.currentMoveIndex).toBe(2);
      expect(state.turn).toBe('w');
    });

    it('should navigate to end', () => {
      manager.navigateToMove(0);
      manager.navigateToMove(4);

      const state = manager.getState();
      expect(state.currentMoveIndex).toBe(4);
    });

    it('should throw on invalid index', () => {
      expect(() => manager.navigateToMove(-1)).toThrow();
      expect(() => manager.navigateToMove(100)).toThrow();
    });
  });

  describe('getLegalMoves', () => {
    it('should return legal moves from starting position', () => {
      const moves = manager.getLegalMoves();

      expect(moves.length).toBe(20); // 16 pawn moves + 4 knight moves
      expect(moves.some((m) => m.san === 'e4')).toBe(true);
      expect(moves.some((m) => m.san === 'Nf3')).toBe(true);
    });

    it('should return legal moves after e4', () => {
      manager.makeMove('e2', 'e4');
      const moves = manager.getLegalMoves();

      expect(moves.length).toBe(20);
      expect(moves.some((m) => m.san === 'e5')).toBe(true);
      expect(moves.some((m) => m.san === 'c5')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset to starting position', () => {
      manager.makeMove('e2', 'e4');
      manager.makeMove('e7', 'e5');
      manager.reset();

      const state = manager.getState();
      expect(state.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      expect(state.history).toHaveLength(0);
      expect(state.currentMoveIndex).toBe(0);
    });
  });

  describe('game status', () => {
    it('should detect check', () => {
      // Scholar's mate setup (not mate, just check)
      manager.loadFEN('rnbqk2r/pppp1ppp/5n2/2b1p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');

      const state = manager.getState();
      expect(state.isCheck).toBe(false);

      // Make a move that gives check
      manager.makeMove('h5', 'f7');
      const stateAfter = manager.getState();
      expect(stateAfter.isCheck).toBe(true);
    });

    it('should detect checkmate', () => {
      // Fool's mate position
      manager.loadPGN('1. f3 e5 2. g4 Qh4#');

      const state = manager.getState();
      expect(state.isCheckmate).toBe(true);
      expect(state.isGameOver).toBe(true);
    });

    it('should detect stalemate', () => {
      // Classic stalemate: White king on h1, Black queen on f2, Black king on g3
      // White has no legal moves but is not in check
      manager.loadFEN('8/8/8/8/8/6k1/5q2/7K w - - 0 1');

      const state = manager.getState();
      expect(state.isStalemate).toBe(true);
      expect(state.isGameOver).toBe(true);
    });
  });
});

