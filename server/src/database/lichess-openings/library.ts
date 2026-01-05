/**
 * Lichess Chess Openings Library
 * 
 * Provides fast lookup of chess opening names by position (EPD/FEN),
 * ECO code, or name search.
 * 
 * Data source: https://github.com/lichess-org/chess-openings (CC0 Public Domain)
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load opening data from JSON file
function loadOpeningsData(): LichessOpening[] {
  const dataPath = join(__dirname, 'data.json');
  const content = readFileSync(dataPath, 'utf-8');
  return JSON.parse(content) as LichessOpening[];
}

// Lazy-loaded data
let _openingsData: LichessOpening[] | null = null;

function getOpeningsData(): LichessOpening[] {
  if (!_openingsData) {
    _openingsData = loadOpeningsData();
  }
  return _openingsData;
}

/**
 * A chess opening from the Lichess database
 */
export interface LichessOpening {
  /** ECO code (e.g., "B30") */
  eco: string;
  /** Opening name (e.g., "Sicilian Defense: Old Sicilian") */
  name: string;
  /** PGN moves (e.g., "1. e4 c5 2. Nf3 Nc6") */
  pgn: string;
  /** UCI notation (e.g., "e2e4 c7c5 g1f3 b8c6") */
  uci: string;
  /** EPD - FEN without move counters (e.g., "r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -") */
  epd: string;
}

/**
 * Normalize a FEN string to EPD format for consistent lookups
 * EPD is the first 4 parts of FEN: position, turn, castling, en-passant
 */
function normalizeToEpd(fen: string): string {
  const parts = fen.split(' ');
  // Take first 4 parts, or all if fewer
  return parts.slice(0, 4).join(' ');
}

/**
 * Normalize search query for consistent matching
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

/**
 * LichessOpeningLibrary provides efficient lookup of chess openings
 * 
 * @example
 * ```typescript
 * import { getLichessOpeningLibrary } from './library.js';
 * 
 * const library = getLichessOpeningLibrary();
 * 
 * // Find opening by position
 * const italian = library.getByPosition('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3');
 * console.log(italian?.name); // "Italian Game"
 * 
 * // Search by name
 * const sicilians = library.search('sicilian', 10);
 * 
 * // Browse by ECO
 * const b30Variations = library.getByEco('B30');
 * ```
 */
export class LichessOpeningLibrary {
  private readonly openings: LichessOpening[];
  private readonly epdIndex: Map<string, LichessOpening>;
  private readonly ecoIndex: Map<string, LichessOpening[]>;
  private readonly searchIndex: Array<{ normalized: string; opening: LichessOpening }>;

  constructor(data?: LichessOpening[]) {
    this.openings = data ?? getOpeningsData();
    this.epdIndex = new Map();
    this.ecoIndex = new Map();
    this.searchIndex = [];

    this.buildIndices();
  }

  /**
   * Build lookup indices for fast access
   */
  private buildIndices(): void {
    for (const opening of this.openings) {
      // EPD index for position lookup
      // If multiple openings share the same position, keep the one with the shortest name
      // (usually the more general opening name)
      const existing = this.epdIndex.get(opening.epd);
      if (!existing || opening.name.length < existing.name.length) {
        this.epdIndex.set(opening.epd, opening);
      }

      // ECO index
      const ecoList = this.ecoIndex.get(opening.eco) || [];
      ecoList.push(opening);
      this.ecoIndex.set(opening.eco, ecoList);

      // Search index with normalized name
      this.searchIndex.push({
        normalized: normalizeQuery(opening.name),
        opening,
      });
    }
  }

  /**
   * Get total number of openings in the library
   */
  get count(): number {
    return this.openings.length;
  }

  /**
   * Get all openings in the library
   * Returns a copy to prevent mutation
   */
  getAll(): LichessOpening[] {
    return [...this.openings];
  }

  /**
   * Find an opening by position (FEN or EPD)
   * 
   * @param fen - Full FEN or EPD string
   * @returns Opening if found, null otherwise
   * 
   * @example
   * ```typescript
   * // Works with full FEN
   * library.getByPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
   * 
   * // Also works with EPD (FEN without move counters)
   * library.getByPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3');
   * ```
   */
  getByPosition(fen: string): LichessOpening | null {
    const epd = normalizeToEpd(fen);
    return this.epdIndex.get(epd) || null;
  }

  /**
   * Get all openings for a given ECO code
   * 
   * @param eco - ECO code (e.g., "B30", "C50")
   * @returns Array of openings (empty if none found)
   * 
   * @example
   * ```typescript
   * const sicilianOld = library.getByEco('B30');
   * // Returns all B30 variations
   * ```
   */
  getByEco(eco: string): LichessOpening[] {
    return this.ecoIndex.get(eco.toUpperCase()) || [];
  }

  /**
   * Get all ECO codes that match a prefix
   * 
   * @param prefix - ECO prefix (e.g., "B", "B3", "B30")
   * @returns Array of matching ECO codes
   */
  getEcoCodes(prefix?: string): string[] {
    const codes = Array.from(this.ecoIndex.keys()).sort();
    if (!prefix) return codes;
    
    const upperPrefix = prefix.toUpperCase();
    return codes.filter(code => code.startsWith(upperPrefix));
  }

  /**
   * Search openings by name
   * 
   * @param query - Search query (case-insensitive)
   * @param limit - Maximum results (default: 20)
   * @returns Array of matching openings, sorted by relevance
   * 
   * @example
   * ```typescript
   * const results = library.search('sicilian najdorf', 10);
   * // Returns openings containing "sicilian" and "najdorf" in name
   * ```
   */
  search(query: string, limit: number = 20): LichessOpening[] {
    const normalized = normalizeQuery(query);
    if (!normalized) return [];

    const terms = normalized.split(/\s+/);
    const results: Array<{ opening: LichessOpening; score: number }> = [];

    for (const { normalized: name, opening } of this.searchIndex) {
      // Check if all terms match
      const allMatch = terms.every(term => name.includes(term));
      if (!allMatch) continue;

      // Score: exact match > starts with > contains
      // Also prefer shorter names (more specific matches)
      let score = 0;
      if (name === normalized) {
        score = 100;
      } else if (name.startsWith(normalized)) {
        score = 80;
      } else {
        // Bonus for matches at word boundaries
        const wordStart = terms.every(term => {
          const idx = name.indexOf(term);
          return idx === 0 || name[idx - 1] === ' ' || name[idx - 1] === ':';
        });
        score = wordStart ? 60 : 40;
      }

      // Prefer shorter names (penalty for length)
      score -= name.length / 10;

      results.push({ opening, score });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit).map(r => r.opening);
  }

  /**
   * Get openings grouped by ECO family (A, B, C, D, E)
   * 
   * @returns Map of ECO family to openings count
   */
  getEcoFamilyCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const opening of this.openings) {
      const family = opening.eco[0];
      counts.set(family, (counts.get(family) || 0) + 1);
    }
    return counts;
  }

  /**
   * Get a sample of openings from each ECO family
   * Useful for UI displays
   * 
   * @param perFamily - Number of openings per family (default: 5)
   * @returns Map of ECO family to sample openings
   */
  getSamplesByFamily(perFamily: number = 5): Map<string, LichessOpening[]> {
    const samples = new Map<string, LichessOpening[]>();
    const families = ['A', 'B', 'C', 'D', 'E'];
    
    for (const family of families) {
      const familyOpenings = this.openings.filter(o => o.eco.startsWith(family));
      // Take diverse samples (spread across ECO numbers)
      const step = Math.max(1, Math.floor(familyOpenings.length / perFamily));
      const sample: LichessOpening[] = [];
      for (let i = 0; i < familyOpenings.length && sample.length < perFamily; i += step) {
        sample.push(familyOpenings[i]);
      }
      samples.set(family, sample);
    }
    
    return samples;
  }
}

// Singleton instance
let libraryInstance: LichessOpeningLibrary | null = null;

/**
 * Get the singleton LichessOpeningLibrary instance
 * 
 * @example
 * ```typescript
 * import { getLichessOpeningLibrary } from './library.js';
 * 
 * const library = getLichessOpeningLibrary();
 * console.log(`Loaded ${library.count} openings`);
 * ```
 */
export function getLichessOpeningLibrary(): LichessOpeningLibrary {
  if (!libraryInstance) {
    libraryInstance = new LichessOpeningLibrary();
  }
  return libraryInstance;
}

/**
 * Create a new LichessOpeningLibrary instance with custom data
 * Useful for testing
 */
export function createLichessOpeningLibrary(data: LichessOpening[]): LichessOpeningLibrary {
  return new LichessOpeningLibrary(data);
}

// Re-export type
export type { LichessOpening as Opening };

