/**
 * Local Explorer Query Layer
 *
 * Provides a query interface that matches the Lichess Opening Explorer API format.
 * Reads from the local LMDB database and transforms results to match ExplorerResult.
 *
 * Usage:
 * ```typescript
 * const explorer = new LocalExplorer('./data/opening-index.lmdb');
 * const result = await explorer.query(fen);
 * // Returns ExplorerResult matching Lichess API format
 * ```
 */

import { Chess } from 'chess.js';
import type {
  ExplorerResult,
  ExplorerStats,
  ExplorerMoveStats,
  LichessExplorerResponse,
  LichessExplorerMove,
  LichessOpeningInfo,
  LichessDatabase,
} from '@chess/shared';
import { LmdbStore, openLmdbStore } from './storage/lmdb-store.js';
import type { LmdbStoreConfig } from './storage/lmdb-store.js';
import { hashFen } from './zobrist.js';
import type { ReadStore, MoveStats } from './types.js';

// Import the Lichess opening library for name lookups
import { getLichessOpeningLibrary } from '../lichess-openings/index.js';

/**
 * Configuration for LocalExplorer
 */
export interface LocalExplorerConfig {
  /** Path to LMDB database */
  dbPath: string;
  /** Optional LMDB configuration */
  lmdbConfig?: Partial<LmdbStoreConfig>;
}

/**
 * Local Opening Explorer
 *
 * Drop-in replacement for the Lichess API explorer that reads from local database.
 */
export class LocalExplorer {
  private store: LmdbStore | null = null;
  private dbPath: string;
  private lmdbConfig: Partial<LmdbStoreConfig>;

  constructor(config: LocalExplorerConfig | string) {
    if (typeof config === 'string') {
      this.dbPath = config;
      this.lmdbConfig = {};
    } else {
      this.dbPath = config.dbPath;
      this.lmdbConfig = config.lmdbConfig ?? {};
    }
  }

  /**
   * Open the database connection
   */
  async open(): Promise<void> {
    if (this.store) return;

    this.store = openLmdbStore({
      path: this.dbPath,
      readOnly: true,
      ...this.lmdbConfig,
    });
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.store) {
      await this.store.close();
      this.store = null;
    }
  }

  /**
   * Query a position and return results in Lichess API format
   *
   * @param fen - FEN string of the position to query
   * @param options - Query options (limit, etc.)
   * @returns ExplorerResult matching Lichess API format
   */
  async query(
    fen: string,
    options: { limit?: number } = {}
  ): Promise<ExplorerResult> {
    await this.ensureOpen();

    const limit = options.limit ?? 12;
    const hash = hashFen(fen);

    // Get position stats
    const posStats = await this.store!.getPosition(hash);
    const moves = await this.store!.getMoves(hash);

    // If no data, return empty result
    if (!posStats || (posStats.white + posStats.draws + posStats.black) === 0) {
      return this.emptyResult();
    }

    // Compute statistics
    const totalGames = posStats.white + posStats.draws + posStats.black;
    const stats: ExplorerStats = {
      totalGames,
      whiteWinPercent: (posStats.white / totalGames) * 100,
      drawPercent: (posStats.draws / totalGames) * 100,
      blackWinPercent: (posStats.black / totalGames) * 100,
    };

    // Convert moves to API format with SAN
    const explorerMoves = this.convertMoves(fen, moves, totalGames, limit);

    // Look up opening name
    const opening = this.lookupOpening(fen);

    // Build raw response (simulated Lichess format)
    const raw: LichessExplorerResponse = {
      white: posStats.white,
      draws: posStats.draws,
      black: posStats.black,
      moves: explorerMoves.map(m => ({
        uci: m.uci,
        san: m.san,
        white: m.white,
        draws: m.draws,
        black: m.black,
        averageRating: m.averageRating,
        opening: m.opening,
      })),
      topGames: [],
      opening,
    };

    return {
      raw,
      stats,
      moves: explorerMoves,
      opening,
      database: 'local' as LichessDatabase,
    };
  }

  /**
   * Check if a position exists in the database
   */
  async hasPosition(fen: string): Promise<boolean> {
    await this.ensureOpen();
    const hash = hashFen(fen);
    return this.store!.hasPosition(hash);
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{ positionCount: number; moveCount: number }> {
    await this.ensureOpen();
    const stats = await this.store!.getStats();
    return {
      positionCount: stats.positionCount,
      moveCount: stats.moveCount,
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async ensureOpen(): Promise<void> {
    if (!this.store) {
      await this.open();
    }
  }

  private emptyResult(): ExplorerResult {
    return {
      raw: {
        white: 0,
        draws: 0,
        black: 0,
        moves: [],
        topGames: [],
      },
      stats: {
        totalGames: 0,
        whiteWinPercent: 0,
        drawPercent: 0,
        blackWinPercent: 0,
      },
      moves: [],
      database: 'local' as LichessDatabase,
    };
  }

  /**
   * Convert internal move stats to Lichess API format with SAN notation
   */
  private convertMoves(
    fen: string,
    moves: MoveStats[],
    totalPositionGames: number,
    limit: number
  ): ExplorerMoveStats[] {
    const chess = new Chess(fen);
    const result: ExplorerMoveStats[] = [];

    for (const move of moves.slice(0, limit)) {
      // Convert UCI to SAN
      const san = this.uciToSan(chess, move.uci);
      if (!san) continue; // Invalid move

      const totalGames = move.white + move.draws + move.black;
      const avgRating = move.games > 0 ? Math.round(move.ratingSum / move.games) : 0;

      result.push({
        uci: move.uci,
        san,
        white: move.white,
        draws: move.draws,
        black: move.black,
        averageRating: avgRating,
        totalGames,
        playRate: totalPositionGames > 0 ? (totalGames / totalPositionGames) * 100 : 0,
        whiteWinPercent: totalGames > 0 ? (move.white / totalGames) * 100 : 0,
        drawPercent: totalGames > 0 ? (move.draws / totalGames) * 100 : 0,
        blackWinPercent: totalGames > 0 ? (move.black / totalGames) * 100 : 0,
      });
    }

    // Sort by total games (most popular first)
    result.sort((a, b) => b.totalGames - a.totalGames);

    return result;
  }

  /**
   * Convert UCI notation to SAN
   */
  private uciToSan(chess: Chess, uci: string): string | null {
    try {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci[4] : undefined;

      const move = chess.move({ from, to, promotion });
      if (!move) return null;

      const san = move.san;
      chess.undo(); // Reset position for next move
      return san;
    } catch {
      return null;
    }
  }

  /**
   * Look up opening name from the Lichess openings database (3,600+ openings)
   */
  private lookupOpening(fen: string): LichessOpeningInfo | undefined {
    const library = getLichessOpeningLibrary();
    const opening = library.getByPosition(fen);
    
    if (opening) {
      return { eco: opening.eco, name: opening.name };
    }
    
    return undefined;
  }
}

/**
 * Create and open a LocalExplorer (convenience function)
 */
export async function createLocalExplorer(
  config: LocalExplorerConfig | string
): Promise<LocalExplorer> {
  const explorer = new LocalExplorer(config);
  await explorer.open();
  return explorer;
}

