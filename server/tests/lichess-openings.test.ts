/**
 * Tests for LichessOpeningLibrary
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  LichessOpeningLibrary,
  getLichessOpeningLibrary,
  createLichessOpeningLibrary,
  type LichessOpening,
} from '../src/database/lichess-openings/index.js';

describe('LichessOpeningLibrary', () => {
  let library: LichessOpeningLibrary;

  beforeAll(() => {
    library = getLichessOpeningLibrary();
  });

  describe('loading', () => {
    it('loads all openings from dataset', () => {
      expect(library.count).toBeGreaterThan(3000);
      console.log(`Loaded ${library.count} openings`);
    });

    it('singleton returns same instance', () => {
      const instance1 = getLichessOpeningLibrary();
      const instance2 = getLichessOpeningLibrary();
      expect(instance1).toBe(instance2);
    });

    it('createLichessOpeningLibrary creates new instance with custom data', () => {
      const customData: LichessOpening[] = [
        {
          eco: 'C50',
          name: 'Italian Game',
          pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4',
          uci: 'e2e4 e7e5 g1f3 b8c6 f1c4',
          epd: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -',
        },
      ];
      const customLibrary = createLichessOpeningLibrary(customData);
      expect(customLibrary.count).toBe(1);
    });
  });

  describe('getByPosition', () => {
    it('returns correct opening for Italian Game position', () => {
      // Italian Game: 1. e4 e5 2. Nf3 Nc6 3. Bc4
      const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
      const opening = library.getByPosition(fen);
      
      expect(opening).not.toBeNull();
      expect(opening?.name).toBe('Italian Game');
      expect(opening?.eco).toBe('C50');
    });

    it('returns correct opening for Sicilian Defense', () => {
      // Sicilian Defense: 1. e4 c5
      // Note: en-passant is "-" because no legal en-passant capture exists
      const fen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
      const opening = library.getByPosition(fen);
      
      expect(opening).not.toBeNull();
      expect(opening?.name).toBe('Sicilian Defense');
      expect(opening?.eco).toBe('B20');
    });

    it('returns correct opening for French Defense', () => {
      // French Defense: 1. e4 e6
      const fen = 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
      const opening = library.getByPosition(fen);
      
      expect(opening).not.toBeNull();
      expect(opening?.name).toBe('French Defense');
      expect(opening?.eco).toBe('C00');
    });

    it('returns correct opening for Ruy Lopez', () => {
      // Ruy Lopez: 1. e4 e5 2. Nf3 Nc6 3. Bb5
      const fen = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
      const opening = library.getByPosition(fen);
      
      expect(opening).not.toBeNull();
      expect(opening?.name).toBe('Ruy Lopez');
      expect(opening?.eco).toBe('C60');
    });

    it('returns null for unknown position', () => {
      // Random position not in opening database
      const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 5';
      const opening = library.getByPosition(fen);
      
      // May or may not find this position depending on database coverage
      // Just verify it doesn't crash
      expect(opening === null || typeof opening?.name === 'string').toBe(true);
    });

    it('normalizes FEN with move counters', () => {
      // Same position with different move counters should match
      const fen1 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
      const fen2 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 5 10';
      
      const opening1 = library.getByPosition(fen1);
      const opening2 = library.getByPosition(fen2);
      
      expect(opening1).toEqual(opening2);
    });

    it('works with EPD (no move counters)', () => {
      // EPD format without halfmove and fullmove counters
      const epd = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -';
      const opening = library.getByPosition(epd);
      
      expect(opening).not.toBeNull();
      expect(opening?.name).toBe('Sicilian Defense');
    });
  });

  describe('getByEco', () => {
    it('returns all B20 variations (Sicilian Defense base)', () => {
      const openings = library.getByEco('B20');
      
      expect(openings.length).toBeGreaterThan(0);
      expect(openings.every(o => o.eco === 'B20')).toBe(true);
    });

    it('returns all C50 variations (Italian Game)', () => {
      const openings = library.getByEco('C50');
      
      expect(openings.length).toBeGreaterThan(0);
      expect(openings.every(o => o.eco === 'C50')).toBe(true);
    });

    it('handles lowercase ECO codes', () => {
      const openings = library.getByEco('b20');
      
      expect(openings.length).toBeGreaterThan(0);
    });

    it('returns empty array for non-existent ECO', () => {
      const openings = library.getByEco('Z99');
      
      expect(openings).toEqual([]);
    });
  });

  describe('getEcoCodes', () => {
    it('returns all ECO codes', () => {
      const codes = library.getEcoCodes();
      
      expect(codes.length).toBeGreaterThan(100);
      expect(codes).toContain('A00');
      expect(codes).toContain('B20');
      expect(codes).toContain('C50');
    });

    it('filters by prefix', () => {
      const bCodes = library.getEcoCodes('B');
      
      expect(bCodes.every(c => c.startsWith('B'))).toBe(true);
      expect(bCodes.length).toBeGreaterThan(50);
    });

    it('filters by partial ECO', () => {
      const b3Codes = library.getEcoCodes('B3');
      
      expect(b3Codes.every(c => c.startsWith('B3'))).toBe(true);
    });
  });

  describe('search', () => {
    it('finds "Sicilian" openings', () => {
      const results = library.search('sicilian');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(o => o.name.toLowerCase().includes('sicilian'))).toBe(true);
    });

    it('finds "Sicilian Najdorf" with multiple terms', () => {
      const results = library.search('sicilian najdorf');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(o => 
        o.name.toLowerCase().includes('sicilian') && 
        o.name.toLowerCase().includes('najdorf')
      )).toBe(true);
    });

    it('search is case-insensitive', () => {
      const results1 = library.search('SICILIAN');
      const results2 = library.search('sicilian');
      const results3 = library.search('Sicilian');
      
      expect(results1.length).toBe(results2.length);
      expect(results2.length).toBe(results3.length);
    });

    it('respects limit parameter', () => {
      const results5 = library.search('defense', 5);
      const results10 = library.search('defense', 10);
      
      expect(results5.length).toBeLessThanOrEqual(5);
      expect(results10.length).toBeLessThanOrEqual(10);
    });

    it('returns empty array for no matches', () => {
      const results = library.search('xyznonexistent');
      
      expect(results).toEqual([]);
    });

    it('returns empty array for empty query', () => {
      const results = library.search('');
      
      expect(results).toEqual([]);
    });

    it('handles partial word matches', () => {
      const results = library.search('italian');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(o => o.name === 'Italian Game')).toBe(true);
    });

    it('prioritizes exact matches', () => {
      const results = library.search('italian game');
      
      // "Italian Game" should be near the top
      expect(results.length).toBeGreaterThan(0);
      const italianGameIndex = results.findIndex(o => o.name === 'Italian Game');
      expect(italianGameIndex).toBeLessThan(5);
    });
  });

  describe('getAll', () => {
    it('returns all openings', () => {
      const all = library.getAll();
      
      expect(all.length).toBe(library.count);
    });

    it('returns a copy (not the internal array)', () => {
      const all1 = library.getAll();
      const all2 = library.getAll();
      
      expect(all1).not.toBe(all2);
      expect(all1).toEqual(all2);
    });
  });

  describe('getEcoFamilyCounts', () => {
    it('returns counts for all ECO families', () => {
      const counts = library.getEcoFamilyCounts();
      
      expect(counts.get('A')).toBeGreaterThan(0);
      expect(counts.get('B')).toBeGreaterThan(0);
      expect(counts.get('C')).toBeGreaterThan(0);
      expect(counts.get('D')).toBeGreaterThan(0);
      expect(counts.get('E')).toBeGreaterThan(0);
    });

    it('totals match library count', () => {
      const counts = library.getEcoFamilyCounts();
      const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
      
      expect(total).toBe(library.count);
    });
  });

  describe('getSamplesByFamily', () => {
    it('returns samples for each ECO family', () => {
      const samples = library.getSamplesByFamily(3);
      
      expect(samples.get('A')?.length).toBeLessThanOrEqual(3);
      expect(samples.get('B')?.length).toBeLessThanOrEqual(3);
      expect(samples.get('C')?.length).toBeLessThanOrEqual(3);
      expect(samples.get('D')?.length).toBeLessThanOrEqual(3);
      expect(samples.get('E')?.length).toBeLessThanOrEqual(3);
    });

    it('samples contain diverse ECO codes', () => {
      const samples = library.getSamplesByFamily(5);
      const bSamples = samples.get('B') || [];
      
      // Check that samples span different ECO codes within B family
      const uniqueEcoCodes = new Set(bSamples.map(o => o.eco));
      expect(uniqueEcoCodes.size).toBeGreaterThan(1);
    });
  });
});

