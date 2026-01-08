#!/usr/bin/env node
/**
 * Lichess Database Download Script
 *
 * Downloads Lichess database files for offline use.
 * Available databases:
 * - Evaluations: ~1.5GB compressed, contains 342M positions with Stockfish evaluations
 * - Puzzles: ~200MB compressed, contains 5.6M rated puzzles
 * - Games: Multiple TB (monthly exports), full game PGNs
 *
 * Usage:
 *   npx tsx src/database/lichess/download.ts --evaluations
 *   npx tsx src/database/lichess/download.ts --puzzles
 *   npx tsx src/database/lichess/download.ts --games --year 2024 --month 01
 *
 * Note: Files are compressed with ZStandard (.zst). Use pzstd or unzstd to decompress.
 */

import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Download URLs from https://database.lichess.org/
const LICHESS_DB_URLS = {
  evaluations: 'https://database.lichess.org/lichess_db_eval.jsonl.zst',
  puzzles: 'https://database.lichess.org/lichess_db_puzzle.csv.zst',
  // Games are organized by month: https://database.lichess.org/standard/lichess_db_standard_rated_2024-01.pgn.zst
  gamesBase: 'https://database.lichess.org/standard',
};

// Default data directory
const DATA_DIR = join(__dirname, '../../../../data/lichess');

interface DownloadOptions {
  /** Output directory (default: data/lichess) */
  outputDir?: string;
  /** Show download progress */
  progress?: boolean;
  /** Year for games download */
  year?: number;
  /** Month for games download (01-12) */
  month?: string;
}

/**
 * Format bytes for human-readable display
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Download a file with progress reporting
 */
async function downloadFile(
  url: string,
  outputPath: string,
  options: { progress?: boolean } = {}
): Promise<void> {
  console.log(`Downloading: ${url}`);
  console.log(`Output: ${outputPath}`);

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

  let downloadedBytes = 0;
  let lastProgressUpdate = Date.now();
  const startTime = Date.now();

  // Create a transform stream to track progress
  const progressTransform = new TransformStream({
    transform(chunk, controller) {
      downloadedBytes += chunk.length;

      if (options.progress && Date.now() - lastProgressUpdate > 1000) {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = downloadedBytes / elapsed;
        const progress = totalBytes > 0 ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : '?';
        const eta = totalBytes > 0 ? ((totalBytes - downloadedBytes) / speed).toFixed(0) : '?';

        process.stdout.write(
          `\r  Progress: ${progress}% | ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} | ${formatBytes(speed)}/s | ETA: ${eta}s    `
        );
        lastProgressUpdate = Date.now();
      }

      controller.enqueue(chunk);
    },
  });

  const readable = response.body;
  if (!readable) {
    throw new Error('No response body');
  }

  const writer = createWriteStream(outputPath);
  const nodeReadable = Readable.fromWeb(readable.pipeThrough(progressTransform) as any);

  await pipeline(nodeReadable, writer);

  if (options.progress) {
    console.log('\n  Download complete!');
  }
}

/**
 * Download the evaluations database
 *
 * Contains ~342M chess positions evaluated with Stockfish NNUE.
 * File format: JSONL (one position per line)
 *
 * Example entry:
 * {
 *   "fen": "2bq1rk1/pr3ppn/1p2p3/7P/2pP1B1P/2P5/PPQ2PB1/R3R1K1 w - -",
 *   "evals": [{ "pvs": [{ "cp": 311, "line": "g2e4 f7f5 ..." }], "knodes": 206765, "depth": 36 }]
 * }
 */
export async function downloadEvaluations(options: DownloadOptions = {}): Promise<string> {
  const outputDir = options.outputDir ?? DATA_DIR;
  const outputPath = join(outputDir, 'lichess_db_eval.jsonl.zst');

  await downloadFile(LICHESS_DB_URLS.evaluations, outputPath, { progress: options.progress });

  return outputPath;
}

/**
 * Download the puzzles database
 *
 * Contains ~5.6M rated and tagged chess puzzles.
 * File format: CSV
 *
 * Fields: PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags
 */
export async function downloadPuzzles(options: DownloadOptions = {}): Promise<string> {
  const outputDir = options.outputDir ?? DATA_DIR;
  const outputPath = join(outputDir, 'lichess_db_puzzle.csv.zst');

  await downloadFile(LICHESS_DB_URLS.puzzles, outputPath, { progress: options.progress });

  return outputPath;
}

/**
 * Download games for a specific month
 *
 * Contains all rated standard chess games played on lichess.org.
 * File format: PGN (compressed)
 *
 * Warning: Monthly files can be 10-30GB compressed, 70-200GB uncompressed!
 *
 * @param year - Year (e.g., 2024)
 * @param month - Month (01-12)
 */
export async function downloadGames(
  year: number,
  month: string,
  options: DownloadOptions = {}
): Promise<string> {
  const paddedMonth = month.padStart(2, '0');
  const filename = `lichess_db_standard_rated_${year}-${paddedMonth}.pgn.zst`;
  const url = `${LICHESS_DB_URLS.gamesBase}/${filename}`;

  const outputDir = options.outputDir ?? DATA_DIR;
  const outputPath = join(outputDir, 'games', filename);

  await downloadFile(url, outputPath, { progress: options.progress });

  return outputPath;
}

/**
 * Check if database files exist locally
 */
export function checkLocalDatabases(outputDir: string = DATA_DIR): {
  evaluations: boolean;
  puzzles: boolean;
  games: string[];
} {
  const evalPath = join(outputDir, 'lichess_db_eval.jsonl.zst');
  const puzzlePath = join(outputDir, 'lichess_db_puzzle.csv.zst');
  const gamesDir = join(outputDir, 'games');

  const games: string[] = [];
  if (existsSync(gamesDir)) {
    const { readdirSync } = require('node:fs');
    const files = readdirSync(gamesDir) as string[];
    games.push(...files.filter((f: string) => f.endsWith('.pgn.zst')));
  }

  return {
    evaluations: existsSync(evalPath),
    puzzles: existsSync(puzzlePath),
    games,
  };
}

/**
 * Print download instructions
 */
export function printDownloadInstructions(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    Lichess Database Download Instructions                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  Available Databases:                                                         ║
║                                                                               ║
║  1. EVALUATIONS (~1.5GB compressed)                                           ║
║     342M positions with Stockfish NNUE evaluations                            ║
║     npx tsx src/database/lichess/download.ts --evaluations                    ║
║                                                                               ║
║  2. PUZZLES (~200MB compressed)                                               ║
║     5.6M rated and tagged chess puzzles                                       ║
║     npx tsx src/database/lichess/download.ts --puzzles                        ║
║                                                                               ║
║  3. GAMES (10-30GB per month, compressed)                                     ║
║     Full PGN game archives                                                    ║
║     npx tsx src/database/lichess/download.ts --games --year 2024 --month 01   ║
║                                                                               ║
║  Decompression:                                                               ║
║     pzstd -d filename.zst  (fastest)                                          ║
║     unzstd filename.zst                                                       ║
║                                                                               ║
║  Note: The Opening Explorer API (used by this library) doesn't require        ║
║  local database downloads - it queries Lichess servers directly.              ║
║  These downloads are for offline analysis or custom processing.               ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printDownloadInstructions();
    return;
  }

  const options: DownloadOptions = {
    progress: true,
  };

  // Parse output directory
  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    options.outputDir = args[outputIdx + 1];
  }

  try {
    if (args.includes('--evaluations')) {
      console.log('\n📊 Downloading Lichess Evaluations Database...\n');
      const path = await downloadEvaluations(options);
      console.log(`\n✅ Saved to: ${path}\n`);
    }

    if (args.includes('--puzzles')) {
      console.log('\n🧩 Downloading Lichess Puzzles Database...\n');
      const path = await downloadPuzzles(options);
      console.log(`\n✅ Saved to: ${path}\n`);
    }

    if (args.includes('--games')) {
      const yearIdx = args.indexOf('--year');
      const monthIdx = args.indexOf('--month');

      if (yearIdx === -1 || monthIdx === -1) {
        console.error('Error: --games requires --year and --month');
        console.error('Example: --games --year 2024 --month 01');
        process.exit(1);
      }

      const year = parseInt(args[yearIdx + 1], 10);
      const month = args[monthIdx + 1];

      console.log(`\n♟️ Downloading Lichess Games for ${year}-${month}...\n`);
      console.log('⚠️  Warning: Game files are very large (10-30GB compressed)\n');

      const path = await downloadGames(year, month, options);
      console.log(`\n✅ Saved to: ${path}\n`);
    }

    if (args.includes('--check')) {
      const status = checkLocalDatabases(options.outputDir);
      console.log('\n📁 Local Database Status:\n');
      console.log(`  Evaluations: ${status.evaluations ? '✅' : '❌'}`);
      console.log(`  Puzzles: ${status.puzzles ? '✅' : '❌'}`);
      console.log(`  Games: ${status.games.length > 0 ? status.games.join(', ') : '❌ None'}`);
      console.log();
    }
  } catch (error) {
    console.error('\n❌ Download failed:', error);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (process.argv[1]?.includes('download')) {
  main();
}


