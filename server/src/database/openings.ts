import type { OpeningInfo, OpeningStats, ExplorerResult } from '@chess/shared';
import { getExplorer } from './lichess/index.js';
import { getLichessOpeningLibrary } from './lichess-openings/index.js';

export class OpeningDatabase {
  /**
   * Get opening information for a position using the Lichess openings database
   * This uses local data - no network calls required
   */
  async getOpeningInfo(fen: string): Promise<OpeningInfo | null> {
    const library = getLichessOpeningLibrary();
    const opening = library.getByPosition(fen);
    
    if (!opening) {
      return null;
    }
    
    return {
      eco: opening.eco,
      name: opening.name,
      moves: opening.pgn,
      fen: fen,
    };
  }

  /**
   * Search for openings by name
   * @param query - Search query (case-insensitive)
   * @param limit - Maximum results (default: 20)
   */
  searchOpenings(query: string, limit: number = 20): OpeningInfo[] {
    const library = getLichessOpeningLibrary();
    const results = library.search(query, limit);
    
    return results.map(opening => ({
      eco: opening.eco,
      name: opening.name,
      moves: opening.pgn,
      fen: '', // EPD doesn't include move counters
    }));
  }

  /**
   * Get all openings for a specific ECO code
   */
  getOpeningsByEco(eco: string): OpeningInfo[] {
    const library = getLichessOpeningLibrary();
    const openings = library.getByEco(eco);
    
    return openings.map(opening => ({
      eco: opening.eco,
      name: opening.name,
      moves: opening.pgn,
      fen: '',
    }));
  }

  /**
   * Get total count of openings in the database
   */
  getOpeningCount(): number {
    const library = getLichessOpeningLibrary();
    return library.count;
  }

  async getOpeningStats(fen: string): Promise<OpeningStats | null> {
    // Query the Lichess Masters database for real statistics
    return this.queryLichessExplorer(fen, 'masters');
  }

  /**
   * Query the Lichess Opening Explorer API
   * Uses the new lichess library with caching
   */
  async queryLichessExplorer(fen: string, database: 'masters' | 'lichess' = 'masters'): Promise<OpeningStats | null> {
    try {
      const explorer = getExplorer();
      const result = database === 'masters' 
        ? await explorer.masters(fen)
        : await explorer.lichess(fen);
      
      if (result.stats.totalGames === 0) {
        return null;
      }

      return {
        white: result.raw.white,
        draws: result.raw.draws,
        black: result.raw.black,
        total: result.stats.totalGames,
        topMoves: result.moves.map((m) => ({
          san: m.san,
          uci: m.uci,
          white: m.white,
          draws: m.draws,
          black: m.black,
          averageRating: m.averageRating,
          games: m.totalGames,
        })),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get full explorer result with computed statistics
   */
  async getExplorerResult(fen: string, database: 'masters' | 'lichess' = 'masters'): Promise<ExplorerResult | null> {
    try {
      const explorer = getExplorer();
      const result = database === 'masters'
        ? await explorer.masters(fen)
        : await explorer.lichess(fen);
      
      if (result.stats.totalGames === 0) {
        return null;
      }

      return result;
    } catch {
      return null;
    }
  }
}
