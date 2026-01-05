/**
 * Lichess Opening Explorer Library
 *
 * A comprehensive library for exploring chess openings using the Lichess database.
 * Supports multiple databases (masters, lichess, player) with caching and computed statistics.
 *
 * @example
 * ```ts
 * import { OpeningExplorer, STARTING_FEN } from './database/lichess';
 *
 * const explorer = new OpeningExplorer();
 *
 * // Query the masters database
 * const result = await explorer.masters(STARTING_FEN);
 * console.log(result.stats.totalGames); // e.g., 2,700,000
 * console.log(result.moves[0].san); // Most popular first move (e.g., "e4")
 *
 * // Query lichess database with filters
 * const lichessResult = await explorer.lichess(fen, {
 *   speeds: ['rapid', 'classical'],
 *   ratings: [2000, 2200, 2500]
 * });
 *
 * // Query a specific player's games
 * const playerResult = await explorer.player(fen, {
 *   player: 'DrNykterstein',
 *   color: 'white'
 * });
 * ```
 */

// Core explorer class
export {
  OpeningExplorer,
  getExplorer,
  configureExplorer,
  STARTING_FEN,
  DEFAULT_FILTERS,
  type VariationNode,
} from './explorer.js';

// Low-level API functions
export {
  queryMasters,
  queryLichess,
  queryPlayer,
  getGamePgn,
} from './api.js';

// Re-export types from shared for convenience
export type {
  LichessDatabase,
  LichessSpeed,
  LichessRating,
  LichessExplorerMove,
  LichessExplorerGame,
  LichessExplorerResponse,
  LichessOpeningInfo,
  LichessPlayer,
  LichessMastersOptions,
  LichessLichessOptions,
  LichessPlayerOptions,
  ExplorerResult,
  ExplorerStats,
  ExplorerMoveStats,
} from '@chess/shared';

