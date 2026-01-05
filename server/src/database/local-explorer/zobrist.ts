/**
 * Zobrist Hashing for Chess Positions
 *
 * Zobrist hashing creates a unique 64-bit hash for each chess position.
 * It works by XORing random numbers associated with each piece-square combination.
 *
 * Properties:
 * - Incremental: hash can be updated by XORing the moving piece's values
 * - Uniform distribution: minimizes collisions
 * - Fast: just XOR operations
 *
 * The hash includes:
 * - Piece placement (12 piece types × 64 squares = 768 values)
 * - Side to move (1 value)
 * - Castling rights (4 values)
 * - En passant file (8 values)
 *
 * Total: 781 random 64-bit numbers
 */

// =============================================================================
// Types
// =============================================================================

/** Piece types (0-5 for each color) */
export type PieceIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** Square index (0-63, a1=0, h8=63) */
export type SquareIndex = number;

// Piece indices: white pieces 0-5, black pieces 6-11
export const PIECE_INDICES = {
  P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5,  // White
  p: 6, n: 7, b: 8, r: 9, q: 10, k: 11, // Black
} as const;

// =============================================================================
// Random Number Generation (deterministic for reproducibility)
// =============================================================================

/**
 * Simple PRNG (xorshift64) for generating Zobrist keys
 * Deterministic: same seed always produces same sequence
 */
class XorShift64 {
  private state: bigint;

  constructor(seed: bigint = 0x12345678deadbeefn) {
    this.state = seed;
  }

  next(): bigint {
    let x = this.state;
    x ^= x << 13n;
    x ^= x >> 7n;
    x ^= x << 17n;
    // Keep only 64 bits
    this.state = x & 0xffffffffffffffffn;
    return this.state;
  }
}

// =============================================================================
// Zobrist Tables (initialized once)
// =============================================================================

/** Random values for piece-square combinations [piece][square] */
const PIECE_SQUARE_KEYS: bigint[][] = [];

/** Random value for black to move */
let BLACK_TO_MOVE_KEY: bigint;

/** Random values for castling rights [KQkq] */
const CASTLING_KEYS: bigint[] = [];

/** Random values for en passant file [a-h] */
const EN_PASSANT_KEYS: bigint[] = [];

/**
 * Initialize all Zobrist keys
 * Called once at module load
 */
function initializeZobristKeys(): void {
  const rng = new XorShift64(0xc0ffee_deadbeef_cafen);

  // Piece-square keys: 12 pieces × 64 squares
  for (let piece = 0; piece < 12; piece++) {
    PIECE_SQUARE_KEYS[piece] = [];
    for (let square = 0; square < 64; square++) {
      PIECE_SQUARE_KEYS[piece][square] = rng.next();
    }
  }

  // Side to move
  BLACK_TO_MOVE_KEY = rng.next();

  // Castling rights (4 bits: K Q k q)
  for (let i = 0; i < 4; i++) {
    CASTLING_KEYS[i] = rng.next();
  }

  // En passant files (a-h)
  for (let i = 0; i < 8; i++) {
    EN_PASSANT_KEYS[i] = rng.next();
  }
}

// Initialize on module load
initializeZobristKeys();

// =============================================================================
// FEN Parsing Helpers
// =============================================================================

/**
 * Convert algebraic square notation to index (0-63)
 * a1 = 0, b1 = 1, ..., h8 = 63
 */
export function squareToIndex(square: string): SquareIndex {
  const file = square.charCodeAt(0) - 97; // 'a' = 0
  const rank = parseInt(square[1]) - 1;    // '1' = 0
  return rank * 8 + file;
}

/**
 * Convert square index to algebraic notation
 */
export function indexToSquare(index: SquareIndex): string {
  const file = String.fromCharCode(97 + (index % 8));
  const rank = Math.floor(index / 8) + 1;
  return `${file}${rank}`;
}

/**
 * Get piece index from FEN character
 */
export function pieceToIndex(piece: string): PieceIndex | null {
  const idx = PIECE_INDICES[piece as keyof typeof PIECE_INDICES];
  return idx !== undefined ? idx as PieceIndex : null;
}

// =============================================================================
// Main Hashing Functions
// =============================================================================

/**
 * Compute Zobrist hash from a FEN string
 *
 * @param fen - Standard FEN notation
 * @returns 64-bit hash as bigint
 *
 * @example
 * const startingHash = hashFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
 */
export function hashFen(fen: string): bigint {
  const parts = fen.split(' ');
  const position = parts[0];
  const sideToMove = parts[1] || 'w';
  const castling = parts[2] || '-';
  const enPassant = parts[3] || '-';

  let hash = 0n;

  // Hash piece positions
  let square = 56; // Start at a8 (FEN starts from rank 8)

  for (const char of position) {
    if (char === '/') {
      square -= 16; // Move to next rank (go back 8, then forward 8 for new rank)
      continue;
    }

    if (char >= '1' && char <= '8') {
      square += parseInt(char); // Skip empty squares
      continue;
    }

    const pieceIdx = pieceToIndex(char);
    if (pieceIdx !== null) {
      hash ^= PIECE_SQUARE_KEYS[pieceIdx][square];
      square++;
    }
  }

  // Hash side to move
  if (sideToMove === 'b') {
    hash ^= BLACK_TO_MOVE_KEY;
  }

  // Hash castling rights
  if (castling !== '-') {
    if (castling.includes('K')) hash ^= CASTLING_KEYS[0];
    if (castling.includes('Q')) hash ^= CASTLING_KEYS[1];
    if (castling.includes('k')) hash ^= CASTLING_KEYS[2];
    if (castling.includes('q')) hash ^= CASTLING_KEYS[3];
  }

  // Hash en passant
  if (enPassant !== '-') {
    const file = enPassant.charCodeAt(0) - 97; // 'a' = 0
    if (file >= 0 && file < 8) {
      hash ^= EN_PASSANT_KEYS[file];
    }
  }

  return hash;
}

/**
 * Hash a position without en passant and castling
 * Useful for opening book lookups where those don't matter as much
 *
 * @param fen - Standard FEN notation
 * @returns 64-bit hash as bigint
 */
export function hashFenSimple(fen: string): bigint {
  const parts = fen.split(' ');
  const position = parts[0];
  const sideToMove = parts[1] || 'w';

  let hash = 0n;

  // Hash piece positions
  let square = 56;

  for (const char of position) {
    if (char === '/') {
      square -= 16;
      continue;
    }

    if (char >= '1' && char <= '8') {
      square += parseInt(char);
      continue;
    }

    const pieceIdx = pieceToIndex(char);
    if (pieceIdx !== null) {
      hash ^= PIECE_SQUARE_KEYS[pieceIdx][square];
      square++;
    }
  }

  // Hash side to move
  if (sideToMove === 'b') {
    hash ^= BLACK_TO_MOVE_KEY;
  }

  return hash;
}

// =============================================================================
// Incremental Updates (for move-by-move hashing)
// =============================================================================

/**
 * Update hash for a piece moving from one square to another
 * XOR out the old position, XOR in the new position
 */
export function updateHashMove(
  hash: bigint,
  piece: PieceIndex,
  fromSquare: SquareIndex,
  toSquare: SquareIndex
): bigint {
  hash ^= PIECE_SQUARE_KEYS[piece][fromSquare]; // Remove from old square
  hash ^= PIECE_SQUARE_KEYS[piece][toSquare];   // Add to new square
  return hash;
}

/**
 * Update hash for a piece being captured
 */
export function updateHashCapture(
  hash: bigint,
  capturedPiece: PieceIndex,
  square: SquareIndex
): bigint {
  return hash ^ PIECE_SQUARE_KEYS[capturedPiece][square];
}

/**
 * Toggle side to move in hash
 */
export function updateHashSideToMove(hash: bigint): bigint {
  return hash ^ BLACK_TO_MOVE_KEY;
}

/**
 * Update castling rights in hash
 * @param rightsChanged - Array of indices [0=K, 1=Q, 2=k, 3=q] that changed
 */
export function updateHashCastling(hash: bigint, rightsChanged: number[]): bigint {
  for (const right of rightsChanged) {
    hash ^= CASTLING_KEYS[right];
  }
  return hash;
}

/**
 * Update en passant in hash
 * @param oldFile - Previous en passant file (0-7 or -1 for none)
 * @param newFile - New en passant file (0-7 or -1 for none)
 */
export function updateHashEnPassant(
  hash: bigint,
  oldFile: number,
  newFile: number
): bigint {
  if (oldFile >= 0 && oldFile < 8) {
    hash ^= EN_PASSANT_KEYS[oldFile];
  }
  if (newFile >= 0 && newFile < 8) {
    hash ^= EN_PASSANT_KEYS[newFile];
  }
  return hash;
}

// =============================================================================
// Serialization (for storage)
// =============================================================================

/**
 * Convert hash to 8-byte buffer (big-endian)
 */
export function hashToBuffer(hash: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(hash);
  return buf;
}

/**
 * Convert 8-byte buffer to hash
 */
export function bufferToHash(buf: Buffer): bigint {
  return buf.readBigUInt64BE(0);
}

/**
 * Convert hash to hex string
 */
export function hashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, '0');
}

/**
 * Convert hex string to hash
 */
export function hexToHash(hex: string): bigint {
  return BigInt('0x' + hex);
}

// =============================================================================
// Well-known Position Hashes (for testing)
// =============================================================================

/** Hash of the starting position */
export const STARTING_POSITION_HASH = hashFen(
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
);

/** Hash after 1. e4 */
export const AFTER_E4_HASH = hashFen(
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
);

/** Hash after 1. e4 e5 */
export const AFTER_E4_E5_HASH = hashFen(
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2'
);

/** Hash after 1. d4 */
export const AFTER_D4_HASH = hashFen(
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1'
);

