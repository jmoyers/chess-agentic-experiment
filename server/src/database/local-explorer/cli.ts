#!/usr/bin/env node
/**
 * Local Explorer CLI
 *
 * Download and index Lichess games into a local opening explorer database.
 *
 * Usage:
 *   npx tsx src/database/local-explorer/cli.ts download --year 2025 --month 12
 *   npx tsx src/database/local-explorer/cli.ts index --input ./data/lichess_db_standard_rated_2025-12.pgn.zst
 *   npx tsx src/database/local-explorer/cli.ts compact
 *   npx tsx src/database/local-explorer/cli.ts status
 *
 * Full pipeline:
 *   npx tsx src/database/local-explorer/cli.ts build --year 2025 --month 12
 */

import { createWriteStream, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { pipeline, Readable, Transform } from 'node:stream';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRocksStore } from './storage/rocks-store.js';
import { compact } from './storage/compactor.js';
import { processGame } from './indexer/game-processor.js';
import type { RocksStore } from './storage/rocks-store.js';
import type { ParsedGame, GameResult, PositionUpdate } from './types.js';

const pipelineAsync = promisify(pipeline);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Default paths - relative to server/data folder
const DATA_DIR = join(__dirname, '..', '..', '..', 'data');
const ROCKS_PATH = join(DATA_DIR, 'opening-explorer.rocks');
const LMDB_PATH = join(DATA_DIR, 'opening-explorer.lmdb');

// Lichess database URL pattern
const LICHESS_DB_URL = (year: number, month: string) =>
  `https://database.lichess.org/standard/lichess_db_standard_rated_${year}-${month}.pgn.zst`;

/**
 * Format bytes for display
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
 * Format duration in seconds
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

/**
 * Download a file with progress
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  console.log(`\n📥 Downloading: ${url}`);
  console.log(`   Output: ${outputPath}\n`);

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

  let downloadedBytes = 0;
  let lastUpdate = Date.now();
  const startTime = Date.now();

  const progressTransform = new TransformStream({
    transform(chunk, controller) {
      downloadedBytes += chunk.length;

      if (Date.now() - lastUpdate > 1000) {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = downloadedBytes / elapsed;
        const pct = totalBytes > 0 ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : '?';
        const eta = totalBytes > 0 ? formatDuration((totalBytes - downloadedBytes) / speed) : '?';

        process.stdout.write(
          `\r   Progress: ${pct}% | ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} | ${formatBytes(speed)}/s | ETA: ${eta}    `
        );
        lastUpdate = Date.now();
      }

      controller.enqueue(chunk);
    },
  });

  const readable = response.body;
  if (!readable) throw new Error('No response body');

  const writer = createWriteStream(outputPath);
  const nodeReadable = Readable.fromWeb(readable.pipeThrough(progressTransform) as any);

  await pipelineAsync(nodeReadable, writer);

  console.log('\n\n   ✅ Download complete!\n');
}

/**
 * Parse a PGN game from header and move lines
 */
function parsePgnGame(headers: Record<string, string>, movesText: string): ParsedGame | null {
  // Parse result
  const resultStr = headers['Result'] || '';
  let result: GameResult;
  if (resultStr === '1-0') result = 'white';
  else if (resultStr === '0-1') result = 'black';
  else if (resultStr === '1/2-1/2') result = 'draw';
  else return null;

  // Parse moves - strip comments and annotations
  let cleaned = movesText
    .replace(/\{[^}]*\}/g, '')     // Remove comments
    .replace(/\$\d+/g, '')          // Remove NAGs
    .replace(/\d+\.+\s*/g, '')      // Remove move numbers (including trailing space)
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, '');

  // Remove variations (handle nested)
  let depth = 0;
  let noVariations = '';
  for (const char of cleaned) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0) noVariations += char;
  }

  // SAN move patterns:
  // - Pawn moves: e4, d3, exd5, e8=Q, axb8=N+
  // - Piece moves: Nf3, Bb5, Qxd7, Rad1, N1e2, Nbxd2
  // - Castling: O-O, O-O-O
  const sanPattern = /^([KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](x[a-h])?[1-8](=[QRBN])?|O-O(-O)?)[+#]?$/;

  const moves = noVariations
    .split(/\s+/)
    .filter(m => m && sanPattern.test(m));

  if (moves.length === 0) return null;

  // Parse rating
  const whiteElo = parseInt(headers['WhiteElo']);
  const blackElo = parseInt(headers['BlackElo']);
  const averageRating = !isNaN(whiteElo) && !isNaN(blackElo)
    ? Math.round((whiteElo + blackElo) / 2)
    : undefined;

  return { moves, result, averageRating };
}

/**
 * Stream and index a .zst compressed PGN file using system zstd
 */
async function indexZstFile(
  zstPath: string,
  store: RocksStore,
  options: {
    minRating?: number;
    maxGames?: number;
    batchSize?: number;
  } = {}
): Promise<{ gamesIndexed: number; positionsIndexed: number; duration: number }> {
  const minRating = options.minRating ?? 0;
  const maxGames = options.maxGames ?? Infinity;
  const batchSize = options.batchSize ?? 5000;

  console.log(`\n📚 Indexing: ${zstPath}`);
  console.log(`   Min rating: ${minRating || 'none'}`);
  console.log(`   Max games: ${maxGames === Infinity ? 'unlimited' : maxGames.toLocaleString()}`);
  console.log(`   Batch size: ${batchSize.toLocaleString()}\n`);

  const startTime = Date.now();

  // Use system zstd to decompress (much more reliable)
  console.log('   🔄 Starting decompression with zstd...\n');
  const zstdProcess = spawn('zstd', ['-d', '-c', zstPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let gamesIndexed = 0;
  let gamesSkipped = 0;
  let linesRead = 0;
  let positionsIndexed = 0;
  let updateBatch: PositionUpdate[] = [];
  let lastLogTime = startTime;
  let stopped = false;

  // PGN parsing state
  let headerLines: string[] = [];
  let moveLines: string[] = [];
  let inHeaders = true;

  const flushBatch = async () => {
    if (updateBatch.length > 0) {
      await store.batchWrite(updateBatch);
      positionsIndexed += updateBatch.length;
      updateBatch = [];
    }
  };

  const processCompletedGame = async (): Promise<boolean> => {
    if (moveLines.length === 0) return true;

    const headers: Record<string, string> = {};
    for (const line of headerLines) {
      const match = line.match(/\[(\w+)\s+"([^"]*)"\]/);
      if (match) headers[match[1]] = match[2];
    }

    // Rating filter
    if (minRating > 0) {
      const whiteElo = parseInt(headers['WhiteElo']);
      const blackElo = parseInt(headers['BlackElo']);
      if (isNaN(whiteElo) || isNaN(blackElo) || (whiteElo + blackElo) / 2 < minRating) {
        gamesSkipped++;
        return true;
      }
    }

    const game = parsePgnGame(headers, moveLines.join(' '));
    if (!game) {
      gamesSkipped++;
      return true;
    }

    // Process game into position updates
    const updates = processGame(game);
    updateBatch.push(...updates);

    gamesIndexed++;

    // Flush batch if large enough
    if (updateBatch.length >= batchSize) {
      await flushBatch();
    }


    // Check if we've reached max games
    if (gamesIndexed >= maxGames) {
      return false; // Signal to stop
    }

    return true;
  };

  // Create readline interface from zstd stdout
  const rl = createInterface({
    input: zstdProcess.stdout,
    crlfDelay: Infinity,
  });

  // Process lines
  for await (const line of rl) {
    if (stopped) break;
    linesRead++;

    // Progress every 2 seconds
    const now = Date.now();
    if (now - lastLogTime > 2000) {
      const elapsed = (now - startTime) / 1000;
      const totalProcessed = gamesIndexed + gamesSkipped;
      const gamesPerSec = totalProcessed > 0 ? totalProcessed / elapsed : 0;
      
      // ETA calculation
      let etaStr = '';
      if (maxGames !== Infinity && gamesIndexed > 0) {
        const remaining = maxGames - gamesIndexed;
        const indexedPerSec = gamesIndexed / elapsed;
        if (indexedPerSec > 0) {
          const etaSecs = remaining / indexedPerSec;
          etaStr = ` | ETA: ${formatDuration(etaSecs)}`;
        }
      }
      
      process.stdout.write(
        `\r\x1b[K   📊 Lines: ${linesRead.toLocaleString()} | Indexed: ${gamesIndexed.toLocaleString()} | Skipped: ${gamesSkipped.toLocaleString()} | ${gamesPerSec.toFixed(0)}/s${etaStr}`
      );
      lastLogTime = now;
    }

    const trimmed = line.trim();

    if (trimmed.length === 0) {
      // Blank line - end of section
      if (moveLines.length > 0) {
        // Game complete - process and reset
        const shouldContinue = await processCompletedGame();
        headerLines = [];
        moveLines = [];
        inHeaders = true;
        if (!shouldContinue) {
          stopped = true;
          break;
        }
      }
      // Don't reset headerLines if we haven't seen moves yet - 
      // this is just the blank line between headers and moves
      continue;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      headerLines.push(trimmed);
      inHeaders = true;
    } else {
      if (inHeaders) inHeaders = false;
      moveLines.push(trimmed);
    }
  }

  // Process final game if any
  if (!stopped && moveLines.length > 0 && gamesIndexed < maxGames) {
    await processCompletedGame();
  }

  // Kill zstd if still running (in case we stopped early)
  if (!zstdProcess.killed) {
    zstdProcess.kill();
  }

  // Final batch
  await flushBatch();

  const duration = (Date.now() - startTime) / 1000;
  console.log(
    `\n\n   ✅ Indexing complete!`
  );
  console.log(`   Games indexed: ${gamesIndexed.toLocaleString()}`);
  console.log(`   Games skipped: ${gamesSkipped.toLocaleString()}`);
  console.log(`   Positions: ${positionsIndexed.toLocaleString()}`);
  console.log(`   Duration: ${formatDuration(duration)}`);
  console.log(`   Speed: ${(gamesIndexed / duration).toFixed(0)} games/sec\n`);

  return { gamesIndexed, positionsIndexed, duration };
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         Local Opening Explorer CLI                            ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  Commands:                                                                    ║
║                                                                               ║
║  download   Download Lichess database file                                    ║
║             --year <YYYY> --month <MM>                                        ║
║             Example: --year 2025 --month 12                                   ║
║                                                                               ║
║  index      Index a downloaded .pgn.zst file                                  ║
║             --input <path>  Path to .pgn.zst file                             ║
║             --min-rating <N>  Filter by minimum average rating                ║
║             --max-games <N>   Limit number of games to index                  ║
║                                                                               ║
║  compact    Compact RocksDB to LMDB for fast queries                          ║
║                                                                               ║
║  status     Show database status and statistics                               ║
║                                                                               ║
║  build      Full pipeline: download + index + compact                         ║
║             --year <YYYY> --month <MM>                                        ║
║             --min-rating <N>  (optional)                                      ║
║             --max-games <N>   (optional)                                      ║
║                                                                               ║
║  Data Directory: ${DATA_DIR}
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
    return;
  }

  // Parse common options
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const year = getArg('year');
  const month = getArg('month')?.padStart(2, '0');
  const input = getArg('input');
  const minRating = getArg('min-rating') ? parseInt(getArg('min-rating')!) : undefined;
  const maxGames = getArg('max-games') ? parseInt(getArg('max-games')!) : undefined;

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  try {
    switch (command) {
      case 'download': {
        if (!year || !month) {
          console.error('Error: --year and --month required');
          process.exit(1);
        }
        const url = LICHESS_DB_URL(parseInt(year), month);
        const filename = `lichess_db_standard_rated_${year}-${month}.pgn.zst`;
        const outputPath = join(DATA_DIR, filename);
        await downloadFile(url, outputPath);
        break;
      }

      case 'index': {
        const zstPath = input || (year && month
          ? join(DATA_DIR, `lichess_db_standard_rated_${year}-${month}.pgn.zst`)
          : null);

        if (!zstPath) {
          console.error('Error: --input or --year/--month required');
          process.exit(1);
        }

        if (!existsSync(zstPath)) {
          console.error(`Error: File not found: ${zstPath}`);
          process.exit(1);
        }

        const store = await openRocksStore({ path: ROCKS_PATH });
        await indexZstFile(zstPath, store, { minRating, maxGames });
        await store.flush();
        await store.close();
        break;
      }

      case 'compact': {
        if (!existsSync(ROCKS_PATH)) {
          console.error('Error: RocksDB not found. Run index first.');
          process.exit(1);
        }

        console.log('\n🗜️  Compacting RocksDB → LMDB...\n');
        const result = await compact({
          sourcePath: ROCKS_PATH,
          targetPath: LMDB_PATH,
          onProgress: (progress) => {
            process.stdout.write(
              `\r   Entries: ${progress.entriesProcessed.toLocaleString()} | ` +
              `Positions: ${progress.positionsCopied.toLocaleString()} | ` +
              `Moves: ${progress.movesCopied.toLocaleString()}    `
            );
          },
        });
        console.log(`\n\n   ✅ Compaction complete!`);
        console.log(`   Positions: ${result.positionsCopied.toLocaleString()}`);
        console.log(`   Moves: ${result.movesCopied.toLocaleString()}`);
        console.log(`   Duration: ${formatDuration(result.elapsedMs / 1000)}\n`);
        break;
      }

      case 'status': {
        console.log('\n📊 Local Explorer Status\n');

        // Check for downloaded files
        const files = ['2025-12', '2025-11', '2025-10'].map(m => ({
          month: m,
          path: join(DATA_DIR, `lichess_db_standard_rated_${m}.pgn.zst`),
        }));

        console.log('   Downloaded files:');
        for (const { month: m, path } of files) {
          if (existsSync(path)) {
            const size = statSync(path).size;
            console.log(`   ✅ ${m}: ${formatBytes(size)}`);
          }
        }

        // Check RocksDB
        if (existsSync(ROCKS_PATH)) {
          console.log(`\n   RocksDB: ✅ ${ROCKS_PATH}`);
        } else {
          console.log(`\n   RocksDB: ❌ Not found`);
        }

        // Check LMDB
        if (existsSync(LMDB_PATH)) {
          console.log(`   LMDB: ✅ ${LMDB_PATH}`);
        } else {
          console.log(`   LMDB: ❌ Not found`);
        }

        console.log();
        break;
      }

      case 'build': {
        if (!year || !month) {
          console.error('Error: --year and --month required');
          process.exit(1);
        }

        const url = LICHESS_DB_URL(parseInt(year), month);
        const filename = `lichess_db_standard_rated_${year}-${month}.pgn.zst`;
        const zstPath = join(DATA_DIR, filename);

        // Step 1: Download if needed
        if (!existsSync(zstPath)) {
          await downloadFile(url, zstPath);
        } else {
          console.log(`\n📥 Using existing file: ${zstPath}\n`);
        }

        // Step 2: Index
        const store = await openRocksStore({ path: ROCKS_PATH });
        await indexZstFile(zstPath, store, { minRating, maxGames });
        await store.flush();
        await store.close();

        // Step 3: Compact
        console.log('\n🗜️  Compacting RocksDB → LMDB...\n');
        const result = await compact({
          sourcePath: ROCKS_PATH,
          targetPath: LMDB_PATH,
          onProgress: (progress) => {
            process.stdout.write(
              `\r   Entries: ${progress.entriesProcessed.toLocaleString()}    `
            );
          },
        });
        console.log(`\n\n   ✅ Compaction complete!`);
        console.log(`   Duration: ${formatDuration(result.elapsedMs / 1000)}\n`);

        console.log('🎉 Build complete! Local explorer ready.\n');
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();

