/**
 * Game Processor
 *
 * Extracts position updates from chess games by replaying moves
 * and recording Zobrist hashes at each position.
 *
 * Uses chess.js for move validation and position tracking.
 */

import { Chess } from 'chess.js';
import { hashFen } from '../zobrist.js';
import type { ParsedGame, PositionUpdate, GameResult } from '../types.js';

/**
 * Configuration for game processing
 */
export interface GameProcessorConfig {
  /** Maximum number of moves to process per game (default: 40) */
  maxMoves?: number;
  /** Whether to use simple hashing (ignores castling/en passant) */
  useSimpleHash?: boolean;
}

/**
 * Process a single game and extract position updates
 *
 * @param game - Parsed game data with moves in SAN notation
 * @param config - Processing configuration
 * @returns Array of position updates for indexing
 *
 * @example
 * const game: ParsedGame = {
 *   moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
 *   result: 'white',
 *   averageRating: 2100,
 * };
 * const updates = processGame(game);
 * // Returns updates for each position in the game
 */
export function processGame(
  game: ParsedGame,
  config: GameProcessorConfig = {}
): PositionUpdate[] {
  const maxMoves = config.maxMoves ?? 40;
  const updates: PositionUpdate[] = [];

  const chess = new Chess();

  // Process up to maxMoves
  const movesToProcess = Math.min(game.moves.length, maxMoves);

  for (let i = 0; i < movesToProcess; i++) {
    const moveStr = game.moves[i];

    // Get current position hash BEFORE making the move
    const hash = hashFen(chess.fen());

    // Try to make the move - chess.js throws for invalid moves
    try {
      const move = chess.move(moveStr);

      if (!move) {
        // Invalid move - stop processing this game
        break;
      }

      // Record the update
      updates.push({
        hash,
        move: move.from + move.to + (move.promotion || ''),
        result: game.result,
        rating: game.averageRating,
      });
    } catch {
      // Invalid move (illegal in position) - stop processing this game
      // This can happen with PGN parsing issues or corrupted games
      break;
    }
  }

  return updates;
}

/**
 * Process a game from PGN moves string
 *
 * @param pgn - PGN move text (e.g., "1. e4 e5 2. Nf3 Nc6")
 * @param result - Game result
 * @param averageRating - Optional average rating
 * @param config - Processing configuration
 * @returns Array of position updates
 *
 * @example
 * const updates = processGameFromPgn(
 *   "1. e4 e5 2. Nf3 Nc6 3. Bb5",
 *   'white',
 *   2100
 * );
 */
export function processGameFromPgn(
  pgn: string,
  result: GameResult,
  averageRating?: number,
  config: GameProcessorConfig = {}
): PositionUpdate[] {
  const moves = parsePgnMoves(pgn);

  return processGame(
    { moves, result, averageRating },
    config
  );
}

/**
 * Process a full PGN string including headers
 *
 * @param fullPgn - Complete PGN with headers and moves
 * @param config - Processing configuration
 * @returns Array of position updates, or null if parsing fails
 */
export function processFullPgn(
  fullPgn: string,
  config: GameProcessorConfig = {}
): PositionUpdate[] | null {
  const parsed = parseFullPgn(fullPgn);

  if (!parsed) {
    return null;
  }

  return processGame(parsed, config);
}

/**
 * Parse PGN move text into an array of SAN moves
 * Removes move numbers, comments, and annotations
 */
export function parsePgnMoves(pgn: string): string[] {
  // Remove comments {...}
  let cleaned = pgn.replace(/\{[^}]*\}/g, '');

  // Remove variations (...)
  cleaned = cleaned.replace(/\([^)]*\)/g, '');

  // Remove NAGs ($1, $2, etc.)
  cleaned = cleaned.replace(/\$\d+/g, '');

  // Remove move numbers and result
  cleaned = cleaned
    .replace(/\d+\.+/g, '')           // Move numbers: 1. 1... 
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, '')  // Results
    .trim();

  // Split on whitespace and filter empty strings
  return cleaned
    .split(/\s+/)
    .filter(move => move.length > 0 && !move.match(/^[.\s]*$/));
}

/**
 * Parse a full PGN string with headers
 */
export function parseFullPgn(pgn: string): ParsedGame | null {
  const lines = pgn.split('\n');

  // Parse headers
  const headers: Record<string, string> = {};
  let movesStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('[') && line.endsWith(']')) {
      // Header line: [Name "Value"]
      const match = line.match(/\[(\w+)\s+"([^"]*)"\]/);
      if (match) {
        headers[match[1]] = match[2];
      }
    } else if (line.length > 0 && !line.startsWith('[')) {
      movesStart = i;
      break;
    }
  }

  // Get moves text
  const movesText = lines.slice(movesStart).join(' ');
  const moves = parsePgnMoves(movesText);

  if (moves.length === 0) {
    return null;
  }

  // Parse result
  const resultStr = headers['Result'] || '';
  let result: GameResult;

  if (resultStr === '1-0') {
    result = 'white';
  } else if (resultStr === '0-1') {
    result = 'black';
  } else {
    result = 'draw';
  }

  // Parse ratings
  let averageRating: number | undefined;
  const whiteElo = parseInt(headers['WhiteElo']);
  const blackElo = parseInt(headers['BlackElo']);

  if (!isNaN(whiteElo) && !isNaN(blackElo)) {
    averageRating = Math.round((whiteElo + blackElo) / 2);
  }

  return {
    moves,
    result,
    averageRating,
    event: headers['Event'],
    year: parseInt(headers['Date']?.split('.')[0]),
  };
}

/**
 * Result type for batch processing
 */
export interface ProcessingResult {
  /** Position updates extracted from the game */
  updates: PositionUpdate[];
  /** Whether processing was successful */
  success: boolean;
  /** Error message if processing failed */
  error?: string;
}

/**
 * Process multiple games in batch
 *
 * @param games - Array of parsed games
 * @param config - Processing configuration
 * @returns Array of processing results
 */
export function processGameBatch(
  games: ParsedGame[],
  config: GameProcessorConfig = {}
): ProcessingResult[] {
  return games.map(game => {
    try {
      const updates = processGame(game, config);
      return { updates, success: true };
    } catch (error) {
      return {
        updates: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}

