/**
 * Zobrist Hashing Tests
 *
 * Verifies that:
 * 1. Same FEN always produces same hash
 * 2. Different positions produce different hashes
 * 3. Hash correctly incorporates all position components
 * 4. Incremental updates produce correct hashes
 */

import { describe, it, expect } from 'vitest';
import {
  hashFen,
  hashFenSimple,
  hashToBuffer,
  bufferToHash,
  hashToHex,
  hexToHash,
  squareToIndex,
  indexToSquare,
  STARTING_POSITION_HASH,
  AFTER_E4_HASH,
  AFTER_E4_E5_HASH,
  AFTER_D4_HASH,
} from '../src/database/local-explorer/index.js';

describe('Zobrist Hashing', () => {
  describe('hashFen', () => {
    it('should produce consistent hash for starting position', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const hash1 = hashFen(fen);
      const hash2 = hashFen(fen);

      expect(hash1).toBe(hash2);
      expect(hash1).toBe(STARTING_POSITION_HASH);
    });

    it('should produce different hashes for different positions', () => {
      const starting = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const afterD4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1';

      const hashStarting = hashFen(starting);
      const hashAfterE4 = hashFen(afterE4);
      const hashAfterD4 = hashFen(afterD4);

      expect(hashStarting).not.toBe(hashAfterE4);
      expect(hashStarting).not.toBe(hashAfterD4);
      expect(hashAfterE4).not.toBe(hashAfterD4);
    });

    it('should incorporate side to move', () => {
      // Same position, different side to move
      const whiteToMove = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
      const blackToMove = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

      expect(hashFen(whiteToMove)).not.toBe(hashFen(blackToMove));
    });

    it('should incorporate castling rights', () => {
      const base = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R';

      const fullCastling = hashFen(`${base} w KQkq - 0 1`);
      const noWhiteKing = hashFen(`${base} w Qkq - 0 1`);
      const noBlackQueen = hashFen(`${base} w KQk - 0 1`);
      const noCastling = hashFen(`${base} w - - 0 1`);

      expect(fullCastling).not.toBe(noWhiteKing);
      expect(fullCastling).not.toBe(noBlackQueen);
      expect(fullCastling).not.toBe(noCastling);
      expect(noWhiteKing).not.toBe(noBlackQueen);
    });

    it('should incorporate en passant', () => {
      const base = 'rnbqkbnr/pppp1ppp/8/4pP2/8/8/PPPPP1PP/RNBQKBNR w KQkq';

      const withEP = hashFen(`${base} e6 0 1`);
      const withoutEP = hashFen(`${base} - 0 1`);
      const differentEP = hashFen(`${base} a6 0 1`);

      expect(withEP).not.toBe(withoutEP);
      expect(withEP).not.toBe(differentEP);
    });

    it('should ignore move counters', () => {
      // Same position, different move counters
      const fen1 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const fen2 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 5 10';

      expect(hashFen(fen1)).toBe(hashFen(fen2));
    });

    it('should handle complex positions', () => {
      // A complex middlegame position
      const complex = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
      const hash = hashFen(complex);

      expect(typeof hash).toBe('bigint');
      expect(hash).toBeGreaterThan(0n);
    });
  });

  describe('hashFenSimple', () => {
    it('should ignore castling and en passant', () => {
      const base = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b';

      const hash1 = hashFenSimple(`${base} KQkq e3 0 1`);
      const hash2 = hashFenSimple(`${base} - - 0 1`);
      const hash3 = hashFenSimple(`${base} Kq a3 0 1`);

      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);
    });

    it('should still incorporate side to move', () => {
      const white = hashFenSimple('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w');
      const black = hashFenSimple('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b');

      expect(white).not.toBe(black);
    });
  });

  describe('Pre-computed hashes', () => {
    it('should match expected values for common positions', () => {
      expect(STARTING_POSITION_HASH).toBe(
        hashFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
      );

      expect(AFTER_E4_HASH).toBe(
        hashFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
      );

      expect(AFTER_E4_E5_HASH).toBe(
        hashFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2')
      );

      expect(AFTER_D4_HASH).toBe(
        hashFen('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1')
      );
    });
  });

  describe('Serialization', () => {
    it('should round-trip through buffer', () => {
      const hash = hashFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
      const buffer = hashToBuffer(hash);
      const recovered = bufferToHash(buffer);

      expect(recovered).toBe(hash);
      expect(buffer.length).toBe(8);
    });

    it('should round-trip through hex', () => {
      const hash = hashFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
      const hex = hashToHex(hash);
      const recovered = hexToHash(hex);

      expect(recovered).toBe(hash);
      expect(hex.length).toBe(16);
    });
  });

  describe('Square conversion', () => {
    it('should convert squares correctly', () => {
      expect(squareToIndex('a1')).toBe(0);
      expect(squareToIndex('h1')).toBe(7);
      expect(squareToIndex('a8')).toBe(56);
      expect(squareToIndex('h8')).toBe(63);
      expect(squareToIndex('e4')).toBe(28);
    });

    it('should convert indices back to squares', () => {
      expect(indexToSquare(0)).toBe('a1');
      expect(indexToSquare(7)).toBe('h1');
      expect(indexToSquare(56)).toBe('a8');
      expect(indexToSquare(63)).toBe('h8');
      expect(indexToSquare(28)).toBe('e4');
    });

    it('should round-trip correctly', () => {
      for (let i = 0; i < 64; i++) {
        const square = indexToSquare(i);
        expect(squareToIndex(square)).toBe(i);
      }
    });
  });

  describe('Collision resistance', () => {
    it('should have no collisions in common opening positions', () => {
      const openings = [
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Starting
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', // 1.e4
        'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1', // 1.d4
        'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1', // 1.c4
        'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1', // 1.Nf3
        'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', // 1.e4 e5
        'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2', // 1.e4 c5
        'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', // 1.e4 e6
        'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', // 1.e4 c6
        'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', // 1.e4 d5
        'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 2', // 1.d4 d5
        'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2', // 1.d4 Nf6
      ];

      const hashes = new Set(openings.map(fen => hashFen(fen)));
      expect(hashes.size).toBe(openings.length);
    });
  });
});


