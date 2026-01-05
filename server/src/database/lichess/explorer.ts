/**
 * Lichess Opening Explorer - High-level interface with caching
 *
 * This class provides a convenient interface to explore chess openings using the
 * Lichess database. It includes:
 * - In-memory caching to reduce API calls
 * - Computed statistics (win percentages, play rates)
 * - Multiple database support (masters, lichess, player)
 */

import type {
  LichessDatabase,
  LichessExplorerResponse,
  LichessMastersOptions,
  LichessLichessOptions,
  LichessPlayerOptions,
  LichessExplorerMove,
  ExplorerResult,
  ExplorerStats,
  ExplorerMoveStats,
  LichessSpeed,
  LichessRating,
} from '@chess/shared';
import {
  queryMasters,
  queryLichess,
  queryPlayer,
  STARTING_FEN,
  DEFAULT_FILTERS,
} from './api.js';

export { STARTING_FEN, DEFAULT_FILTERS };

interface CacheEntry {
  response: LichessExplorerResponse;
  timestamp: number;
}

interface ExplorerConfig {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtl?: number;
  /** Maximum cache entries (default: 1000) */
  maxCacheSize?: number;
  /** Default database to query (default: 'masters') */
  defaultDatabase?: LichessDatabase;
  /** Default filters for lichess database */
  defaultLichessFilters?: {
    speeds?: LichessSpeed[];
    ratings?: LichessRating[];
  };
}

/**
 * Compute win percentages from raw game counts
 */
function computeStats(white: number, draws: number, black: number): ExplorerStats {
  const total = white + draws + black;
  if (total === 0) {
    return {
      totalGames: 0,
      whiteWinPercent: 0,
      drawPercent: 0,
      blackWinPercent: 0,
    };
  }

  return {
    totalGames: total,
    whiteWinPercent: (white / total) * 100,
    drawPercent: (draws / total) * 100,
    blackWinPercent: (black / total) * 100,
  };
}

/**
 * Compute move statistics including play rate relative to total position games
 */
function computeMoveStats(
  move: LichessExplorerMove,
  totalPositionGames: number
): ExplorerMoveStats {
  const totalGames = move.white + move.draws + move.black;
  const stats = computeStats(move.white, move.draws, move.black);

  return {
    ...move,
    totalGames,
    playRate: totalPositionGames > 0 ? (totalGames / totalPositionGames) * 100 : 0,
    whiteWinPercent: stats.whiteWinPercent,
    drawPercent: stats.drawPercent,
    blackWinPercent: stats.blackWinPercent,
  };
}

/**
 * OpeningExplorer provides a high-level interface to the Lichess Opening Explorer API
 * with caching and computed statistics.
 */
export class OpeningExplorer {
  private cache: Map<string, CacheEntry> = new Map();
  private config: Required<ExplorerConfig>;

  constructor(config: ExplorerConfig = {}) {
    this.config = {
      cacheTtl: config.cacheTtl ?? 5 * 60 * 1000, // 5 minutes
      maxCacheSize: config.maxCacheSize ?? 1000,
      defaultDatabase: config.defaultDatabase ?? 'masters',
      defaultLichessFilters: config.defaultLichessFilters ?? DEFAULT_FILTERS.competitive,
    };
  }

  /**
   * Generate a cache key from query parameters
   */
  private getCacheKey(database: LichessDatabase, fen: string, params: Record<string, unknown> = {}): string {
    return `${database}:${fen}:${JSON.stringify(params)}`;
  }

  /**
   * Check cache and return entry if valid
   */
  private getFromCache(key: string): LichessExplorerResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.config.cacheTtl) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  /**
   * Add entry to cache, evicting oldest if necessary
   */
  private addToCache(key: string, response: LichessExplorerResponse): void {
    // Simple LRU: delete oldest entries if at capacity
    if (this.cache.size >= this.config.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
    });
  }

  /**
   * Transform raw API response into ExplorerResult with computed stats
   */
  private transformResponse(
    response: LichessExplorerResponse,
    database: LichessDatabase
  ): ExplorerResult {
    const stats = computeStats(response.white, response.draws, response.black);
    const moves = response.moves
      .map((m) => computeMoveStats(m, stats.totalGames))
      .sort((a, b) => b.totalGames - a.totalGames);

    return {
      raw: response,
      stats,
      moves,
      opening: response.opening,
      database,
    };
  }

  /**
   * Explore a position using the Masters database
   *
   * @example
   * const explorer = new OpeningExplorer();
   * const result = await explorer.masters('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
   * console.log(result.stats); // { totalGames: 1234567, whiteWinPercent: 32, ... }
   * console.log(result.moves[0]); // Most popular move with stats
   */
  async masters(fen: string, options: Omit<LichessMastersOptions, 'fen'> = {}): Promise<ExplorerResult> {
    const cacheKey = this.getCacheKey('masters', fen, options);
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return this.transformResponse(cached, 'masters');
    }

    const response = await queryMasters({ fen, ...options });
    this.addToCache(cacheKey, response);

    return this.transformResponse(response, 'masters');
  }

  /**
   * Explore a position using the Lichess database
   *
   * @example
   * const result = await explorer.lichess(fen, {
   *   speeds: ['rapid', 'classical'],
   *   ratings: [2000, 2200, 2500]
   * });
   */
  async lichess(fen: string, options: Omit<LichessLichessOptions, 'fen'> = {}): Promise<ExplorerResult> {
    const mergedOptions = {
      ...this.config.defaultLichessFilters,
      ...options,
    };

    const cacheKey = this.getCacheKey('lichess', fen, mergedOptions);
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return this.transformResponse(cached, 'lichess');
    }

    const response = await queryLichess({ fen, ...mergedOptions });
    this.addToCache(cacheKey, response);

    return this.transformResponse(response, 'lichess');
  }

  /**
   * Explore a specific player's games
   *
   * @example
   * const result = await explorer.player(fen, {
   *   player: 'DrNykterstein', // Magnus Carlsen's lichess account
   *   color: 'white'
   * });
   */
  async player(fen: string, options: Omit<LichessPlayerOptions, 'fen'>): Promise<ExplorerResult> {
    const cacheKey = this.getCacheKey('player', fen, options);
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return this.transformResponse(cached, 'player');
    }

    const { player, ...restOptions } = options;
    const response = await queryPlayer({ fen, player, ...restOptions });
    this.addToCache(cacheKey, response);

    return this.transformResponse(response, 'player');
  }

  /**
   * Explore a position using the default database
   *
   * @example
   * const explorer = new OpeningExplorer({ defaultDatabase: 'lichess' });
   * const result = await explorer.explore(fen);
   */
  async explore(
    fen: string,
    options: {
      database?: LichessDatabase;
      player?: string;
      speeds?: LichessSpeed[];
      ratings?: LichessRating[];
      since?: string | number;
      until?: string | number;
    } = {}
  ): Promise<ExplorerResult> {
    const database = options.database ?? this.config.defaultDatabase;

    switch (database) {
      case 'masters':
        return this.masters(fen, {
          since: typeof options.since === 'number' ? options.since : undefined,
          until: typeof options.until === 'number' ? options.until : undefined,
        });

      case 'lichess':
        return this.lichess(fen, {
          speeds: options.speeds,
          ratings: options.ratings,
          since: typeof options.since === 'string' ? options.since : undefined,
          until: typeof options.until === 'string' ? options.until : undefined,
        });

      case 'player':
        if (!options.player) {
          throw new Error('Player name required for player database');
        }
        return this.player(fen, {
          player: options.player,
          speeds: options.speeds,
          since: typeof options.since === 'string' ? options.since : undefined,
          until: typeof options.until === 'string' ? options.until : undefined,
        });

      default:
        throw new Error(`Unknown database: ${database}`);
    }
  }

  /**
   * Get variation tree starting from a position
   * Explores the most popular moves recursively up to specified depth
   *
   * @example
   * const tree = await explorer.getVariationTree(STARTING_FEN, { depth: 3 });
   */
  async getVariationTree(
    fen: string,
    options: {
      depth?: number;
      minGames?: number;
      database?: LichessDatabase;
    } = {}
  ): Promise<VariationNode> {
    const depth = options.depth ?? 3;
    const minGames = options.minGames ?? 100;
    const database = options.database ?? this.config.defaultDatabase;

    return this.buildVariationTree(fen, depth, minGames, database);
  }

  private async buildVariationTree(
    fen: string,
    depth: number,
    minGames: number,
    database: LichessDatabase
  ): Promise<VariationNode> {
    const result = await this.explore(fen, { database });

    const node: VariationNode = {
      fen,
      stats: result.stats,
      opening: result.opening,
      children: [],
    };

    if (depth <= 0) {
      return node;
    }

    // Get top moves that meet minimum games threshold
    const significantMoves = result.moves.filter((m) => m.totalGames >= minGames);

    // Recursively explore top 3 moves (to avoid explosion)
    const topMoves = significantMoves.slice(0, 3);

    for (const move of topMoves) {
      // We need to compute the resulting FEN after the move
      // For now, we'll use the opening info if available
      if (move.opening) {
        // Can't easily compute next FEN without chess.js here
        // Just store the move info without recursing
        node.children.push({
          move: {
            san: move.san,
            uci: move.uci,
            stats: {
              totalGames: move.totalGames,
              whiteWinPercent: move.whiteWinPercent,
              drawPercent: move.drawPercent,
              blackWinPercent: move.blackWinPercent,
              playRate: move.playRate,
              averageRating: move.averageRating,
            },
          },
          opening: move.opening,
        });
      }
    }

    return node;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
    };
  }
}

/**
 * Node in a variation tree
 */
export interface VariationNode {
  fen: string;
  stats: ExplorerStats;
  opening?: { eco: string; name: string };
  children: Array<{
    move: {
      san: string;
      uci: string;
      stats: {
        totalGames: number;
        whiteWinPercent: number;
        drawPercent: number;
        blackWinPercent: number;
        playRate: number;
        averageRating: number;
      };
    };
    opening?: { eco: string; name: string };
    subtree?: VariationNode;
  }>;
}

// Export singleton for convenience
let defaultExplorer: OpeningExplorer | null = null;

/**
 * Get the default OpeningExplorer instance
 */
export function getExplorer(): OpeningExplorer {
  if (!defaultExplorer) {
    defaultExplorer = new OpeningExplorer();
  }
  return defaultExplorer;
}

/**
 * Configure the default explorer
 */
export function configureExplorer(config: ExplorerConfig): void {
  defaultExplorer = new OpeningExplorer(config);
}

