/**
 * Lichess Opening Explorer API Client
 *
 * Documentation: https://lichess.org/api#tag/Opening-Explorer
 *
 * Rate limits:
 * - Masters database: ~15 requests/minute
 * - Lichess database: ~15 requests/minute
 * - Player database: ~15 requests/minute
 */

import type {
  LichessExplorerResponse,
  LichessMastersOptions,
  LichessLichessOptions,
  LichessPlayerOptions,
  LichessSpeed,
  LichessRating,
} from '@chess/shared';

const MASTERS_API_URL = 'https://explorer.lichess.ovh/masters';
const LICHESS_API_URL = 'https://explorer.lichess.ovh/lichess';
const PLAYER_API_URL = 'https://explorer.lichess.ovh/player';

// Default starting position
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Build URL search params, filtering out undefined values
 */
function buildParams(params: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      // Lichess API expects comma-separated values for arrays
      if (value.length > 0) {
        searchParams.set(key, value.join(','));
      }
    } else {
      searchParams.set(key, String(value));
    }
  }

  return searchParams;
}

/**
 * Make a request to the Lichess Explorer API with error handling
 */
async function fetchExplorer(url: string): Promise<LichessExplorerResponse> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limited by Lichess API. Please wait before making more requests.');
    }
    if (response.status === 404) {
      // Position not found in database - return empty response
      return {
        white: 0,
        draws: 0,
        black: 0,
        moves: [],
        topGames: [],
      };
    }
    throw new Error(`Lichess API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Query the Masters database (games from titled players)
 *
 * Contains ~2.7M games from OTB tournaments, played by titled players since 1952.
 * Results are sorted by game date (most recent first).
 *
 * @example
 * // Get stats for starting position
 * const result = await queryMasters({ fen: STARTING_FEN });
 *
 * @example
 * // Get stats for Sicilian Defense, only games since 2000
 * const result = await queryMasters({
 *   fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
 *   since: 2000
 * });
 */
export async function queryMasters(
  options: LichessMastersOptions
): Promise<LichessExplorerResponse> {
  const params = buildParams({
    fen: options.fen,
    since: options.since,
    until: options.until,
    moves: options.moves,
    topGames: options.topGames,
  });

  const url = `${MASTERS_API_URL}?${params}`;
  return fetchExplorer(url);
}

/**
 * Query the Lichess database (games played on lichess.org)
 *
 * Contains hundreds of millions of games. Filter by speed and rating.
 *
 * @example
 * // Get stats for starting position, rapid/classical games, 2000+ players
 * const result = await queryLichess({
 *   fen: STARTING_FEN,
 *   speeds: ['rapid', 'classical'],
 *   ratings: [2000, 2200, 2500]
 * });
 */
export async function queryLichess(
  options: LichessLichessOptions
): Promise<LichessExplorerResponse> {
  const params = buildParams({
    fen: options.fen,
    player: options.player,
    speeds: options.speeds,
    ratings: options.ratings,
    since: options.since,
    until: options.until,
    moves: options.moves,
    topGames: options.topGames,
    recentGames: options.recentGames,
  });

  const url = `${LICHESS_API_URL}?${params}`;
  return fetchExplorer(url);
}

/**
 * Query a specific player's games
 *
 * @example
 * // Get Magnus Carlsen's games from a position
 * const result = await queryPlayer({
 *   fen: STARTING_FEN,
 *   player: 'DrNykterstein',
 *   color: 'white'
 * });
 */
export async function queryPlayer(
  options: LichessPlayerOptions
): Promise<LichessExplorerResponse> {
  const params = buildParams({
    fen: options.fen,
    player: options.player,
    color: options.color,
    speeds: options.speeds,
    since: options.since,
    until: options.until,
    moves: options.moves,
    recentGames: options.recentGames,
  });

  const url = `${PLAYER_API_URL}?${params}`;
  return fetchExplorer(url);
}

/**
 * Get the PGN of a specific game from Lichess
 */
export async function getGamePgn(gameId: string): Promise<string> {
  const response = await fetch(`https://lichess.org/game/export/${gameId}`, {
    headers: {
      Accept: 'application/x-chess-pgn',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch game: ${response.status}`);
  }

  return response.text();
}

/**
 * Default filter options for common use cases
 */
export const DEFAULT_FILTERS = {
  /** Competitive games: rapid/classical, 2000+ rating */
  competitive: {
    speeds: ['rapid', 'classical'] as LichessSpeed[],
    ratings: [2000, 2200, 2500] as LichessRating[],
  },
  /** All bullet/blitz games */
  fast: {
    speeds: ['bullet', 'blitz'] as LichessSpeed[],
    ratings: [1600, 1800, 2000, 2200, 2500] as LichessRating[],
  },
  /** High-level games only */
  elite: {
    speeds: ['rapid', 'classical'] as LichessSpeed[],
    ratings: [2500] as LichessRating[],
  },
  /** All games (no filter) */
  all: {
    speeds: ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence'] as LichessSpeed[],
    ratings: [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as LichessRating[],
  },
};

