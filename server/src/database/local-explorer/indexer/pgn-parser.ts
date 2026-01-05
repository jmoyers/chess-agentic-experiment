/**
 * PGN File Parser
 *
 * Streams large PGN files and yields individual games.
 * Handles the Lichess database format efficiently.
 *
 * PGN format:
 * - Games separated by blank lines
 * - Headers in [Name "Value"] format
 * - Moves follow headers
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { ParsedGame, GameResult } from '../types.js';

/**
 * Configuration for PGN parsing
 */
export interface PgnParserConfig {
  /** Minimum average rating to include (default: 0) */
  minRating?: number;
  /** Specific time controls to include (default: all) */
  timeControls?: string[];
  /** Maximum games to parse (default: Infinity) */
  maxGames?: number;
  /** Skip games before this year (default: 0) */
  minYear?: number;
  /** Progress callback */
  onProgress?: (parsed: number, skipped: number) => void;
  /** Progress report interval in games (default: 10000) */
  progressInterval?: number;
}

/**
 * Parse a single PGN game from accumulated lines
 */
function parseGame(
  headerLines: string[],
  moveLines: string[],
  config: PgnParserConfig
): ParsedGame | null {
  // Parse headers
  const headers: Record<string, string> = {};

  for (const line of headerLines) {
    const match = line.match(/\[(\w+)\s+"([^"]*)"\]/);
    if (match) {
      headers[match[1]] = match[2];
    }
  }

  // Check filters
  // Rating filter
  if (config.minRating && config.minRating > 0) {
    const whiteElo = parseInt(headers['WhiteElo']);
    const blackElo = parseInt(headers['BlackElo']);

    if (isNaN(whiteElo) || isNaN(blackElo)) {
      return null; // Skip games without ratings
    }

    const avgRating = (whiteElo + blackElo) / 2;
    if (avgRating < config.minRating) {
      return null;
    }
  }

  // Year filter
  if (config.minYear) {
    const dateStr = headers['Date'] || headers['UTCDate'];
    if (dateStr) {
      const year = parseInt(dateStr.split('.')[0]);
      if (!isNaN(year) && year < config.minYear) {
        return null;
      }
    }
  }

  // Time control filter
  if (config.timeControls && config.timeControls.length > 0) {
    const timeControl = headers['TimeControl'];
    if (timeControl && !config.timeControls.includes(timeControl)) {
      return null;
    }
  }

  // Parse moves
  const movesText = moveLines.join(' ');
  const moves = parsePgnMovesFromText(movesText);

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
  } else if (resultStr === '1/2-1/2') {
    result = 'draw';
  } else {
    // Unknown result (e.g., "*" for ongoing) - skip
    return null;
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
 * Parse PGN move text into array of SAN moves
 */
function parsePgnMovesFromText(text: string): string[] {
  // Remove comments {...}
  let cleaned = text.replace(/\{[^}]*\}/g, '');

  // Remove variations (...)
  // Handle nested variations
  let depth = 0;
  let result = '';
  for (const char of cleaned) {
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (depth === 0) {
      result += char;
    }
  }
  cleaned = result;

  // Remove NAGs ($1, $2, etc.)
  cleaned = cleaned.replace(/\$\d+/g, '');

  // Remove move numbers and result
  cleaned = cleaned
    .replace(/\d+\.+/g, '')              // Move numbers
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, '') // Results
    .trim();

  // Split and filter
  return cleaned
    .split(/\s+/)
    .filter(move => {
      if (!move || move.length === 0) return false;
      // Filter out non-moves (dots, empty, etc.)
      if (move.match(/^[.\s]*$/)) return false;
      // Basic SAN validation: starts with piece or file
      if (move.match(/^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$/)) return true;
      // Castling
      if (move === 'O-O' || move === 'O-O-O') return true;
      return false;
    });
}

/**
 * Stream games from a PGN file
 *
 * @param filePath - Path to PGN file
 * @param config - Parser configuration
 * @yields Parsed games
 *
 * @example
 * for await (const game of streamPgnFile('games.pgn')) {
 *   console.log(`Game: ${game.moves.length} moves, result: ${game.result}`);
 * }
 */
export async function* streamPgnFile(
  filePath: string,
  config: PgnParserConfig = {}
): AsyncGenerator<ParsedGame> {
  const maxGames = config.maxGames ?? Infinity;
  const progressInterval = config.progressInterval ?? 10000;

  const fileStream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let headerLines: string[] = [];
  let moveLines: string[] = [];
  let inHeaders = true;
  let gamesParsed = 0;
  let gamesSkipped = 0;

  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      // Blank line - might be end of game
      if (moveLines.length > 0 || headerLines.length > 0) {
        // Try to parse the completed game
        if (moveLines.length > 0) {
          const game = parseGame(headerLines, moveLines, config);

          if (game) {
            gamesParsed++;
            yield game;

            if (gamesParsed >= maxGames) {
              break;
            }
          } else {
            gamesSkipped++;
          }

          // Report progress
          if (config.onProgress && (gamesParsed + gamesSkipped) % progressInterval === 0) {
            config.onProgress(gamesParsed, gamesSkipped);
          }
        }

        // Reset for next game
        headerLines = [];
        moveLines = [];
        inHeaders = true;
      }
      continue;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      // Header line
      headerLines.push(trimmed);
      inHeaders = true;
    } else {
      // Move line
      if (inHeaders) {
        inHeaders = false;
      }
      moveLines.push(trimmed);
    }
  }

  // Don't forget the last game if file doesn't end with blank line
  if (moveLines.length > 0 && gamesParsed < maxGames) {
    const game = parseGame(headerLines, moveLines, config);
    if (game) {
      gamesParsed++;
      yield game;
    } else {
      gamesSkipped++;
    }
  }

  // Final progress report
  if (config.onProgress) {
    config.onProgress(gamesParsed, gamesSkipped);
  }
}

/**
 * Count games in a PGN file without fully parsing them
 * Useful for progress estimation
 */
export async function countGamesInFile(filePath: string): Promise<number> {
  const fileStream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let count = 0;
  let sawMoves = false;

  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed.startsWith('[Event ')) {
      // New game starts
      if (sawMoves) {
        count++;
      }
      sawMoves = false;
    } else if (trimmed.length > 0 && !trimmed.startsWith('[')) {
      sawMoves = true;
    }
  }

  // Count last game
  if (sawMoves) {
    count++;
  }

  return count;
}

/**
 * Parse games from a PGN string (for testing/small datasets)
 */
export function parseGamesFromString(
  pgnContent: string,
  config: PgnParserConfig = {}
): ParsedGame[] {
  const games: ParsedGame[] = [];
  const lines = pgnContent.split('\n');
  const maxGames = config.maxGames ?? Infinity;

  let headerLines: string[] = [];
  let moveLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      if (moveLines.length > 0) {
        const game = parseGame(headerLines, moveLines, config);
        if (game) {
          games.push(game);
          if (games.length >= maxGames) {
            break;
          }
        }
        headerLines = [];
        moveLines = [];
      }
      continue;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      headerLines.push(trimmed);
    } else {
      moveLines.push(trimmed);
    }
  }

  // Last game
  if (moveLines.length > 0 && games.length < maxGames) {
    const game = parseGame(headerLines, moveLines, config);
    if (game) {
      games.push(game);
    }
  }

  return games;
}

