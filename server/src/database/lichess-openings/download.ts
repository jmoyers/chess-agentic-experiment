/**
 * Download and parse Lichess chess-openings dataset
 * 
 * Source: https://github.com/lichess-org/chess-openings
 * License: CC0 Public Domain
 * 
 * The raw TSV files only contain (eco, name, pgn). We compute:
 * - UCI notation from the PGN moves
 * - EPD (FEN without move counters) for position lookup
 * 
 * Run with: npx tsx src/database/lichess-openings/download.ts
 */

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';
const TSV_FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];

export interface LichessOpening {
  eco: string;
  name: string;
  pgn: string;
  uci: string;
  epd: string;
}

/**
 * Convert FEN to EPD (FEN without halfmove and fullmove counters)
 * Also normalizes en passant - only includes if a legal en passant capture exists
 */
function fenToEpd(fen: string): string {
  const parts = fen.split(' ');
  // EPD is first 4 parts: position, turn, castling, en-passant
  return parts.slice(0, 4).join(' ');
}

/**
 * Parse PGN moves and compute UCI notation + final EPD
 */
function computeFromPgn(pgn: string): { uci: string; epd: string } | null {
  try {
    const chess = new Chess();
    const uciMoves: string[] = [];
    
    // Parse PGN: "1. e4 e5 2. Nf3 Nc6" -> ["e4", "e5", "Nf3", "Nc6"]
    const sanMoves = pgn
      .replace(/\d+\.\s*/g, '') // Remove move numbers
      .split(/\s+/)
      .filter(m => m.length > 0 && !m.includes('.'));
    
    for (const san of sanMoves) {
      const move = chess.move(san);
      if (!move) {
        console.error(`Invalid move ${san} in PGN: ${pgn}`);
        return null;
      }
      // Convert to UCI: e2e4, g1f3, etc.
      const uci = move.from + move.to + (move.promotion || '');
      uciMoves.push(uci);
    }
    
    return {
      uci: uciMoves.join(' '),
      epd: fenToEpd(chess.fen()),
    };
  } catch (error) {
    console.error(`Error parsing PGN "${pgn}":`, error);
    return null;
  }
}

/**
 * Parse a TSV line into an Opening object
 */
function parseTsvLine(line: string): LichessOpening | null {
  const parts = line.split('\t');
  if (parts.length < 3) return null;
  
  const [eco, name, pgn] = parts;
  
  // Skip header line
  if (eco === 'eco') return null;
  
  const computed = computeFromPgn(pgn);
  if (!computed) return null;
  
  return { 
    eco, 
    name, 
    pgn, 
    uci: computed.uci, 
    epd: computed.epd 
  };
}

/**
 * Download a TSV file from GitHub
 */
async function downloadTsv(filename: string): Promise<string> {
  const url = `${BASE_URL}/${filename}`;
  console.log(`Downloading ${url}...`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${filename}: ${response.status} ${response.statusText}`);
  }
  
  return response.text();
}

/**
 * Download all TSV files and parse into openings array
 */
async function downloadAllOpenings(): Promise<LichessOpening[]> {
  const allOpenings: LichessOpening[] = [];
  let errors = 0;
  
  for (const filename of TSV_FILES) {
    const content = await downloadTsv(filename);
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      const opening = parseTsvLine(line);
      if (opening) {
        allOpenings.push(opening);
      } else if (!line.startsWith('eco')) {
        errors++;
      }
    }
  }
  
  if (errors > 0) {
    console.warn(`\nWarning: ${errors} lines failed to parse`);
  }
  
  return allOpenings;
}

/**
 * Main entry point
 */
async function main() {
  console.log('Downloading Lichess chess-openings dataset...\n');
  
  const openings = await downloadAllOpenings();
  
  console.log(`\nParsed ${openings.length} openings`);
  
  // Write to data.json
  const outputPath = join(__dirname, 'data.json');
  writeFileSync(outputPath, JSON.stringify(openings, null, 2));
  
  console.log(`Written to ${outputPath}`);
  
  // Print some stats
  const ecoGroups = new Map<string, number>();
  for (const opening of openings) {
    const group = opening.eco[0];
    ecoGroups.set(group, (ecoGroups.get(group) || 0) + 1);
  }
  
  console.log('\nOpenings by ECO group:');
  for (const [group, count] of Array.from(ecoGroups.entries()).sort()) {
    console.log(`  ${group}: ${count}`);
  }
  
  // Sample output
  console.log('\nSample openings:');
  console.log(JSON.stringify(openings[0], null, 2));
  console.log(JSON.stringify(openings[100], null, 2));
}

// Run if executed directly
main().catch(console.error);
