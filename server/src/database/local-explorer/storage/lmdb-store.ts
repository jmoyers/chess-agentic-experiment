/**
 * LMDB Store
 *
 * Read-optimized persistent store using LMDB (Lightning Memory-Mapped Database).
 * LMDB is a B-tree based key-value store with memory-mapped files.
 *
 * Advantages:
 * - Zero-copy reads (direct memory access)
 * - ACID transactions
 * - Very fast point queries (<1ms)
 * - Crash-safe
 *
 * Used for the serving phase after indexing is complete.
 *
 * Key format (same as RocksDB for compatibility):
 * - Position stats: "p:" + 8-byte hash
 * - Move stats: "m:" + 8-byte hash + ":" + move UCI
 */

import { open, Database, RootDatabase } from 'lmdb';
import type {
  ReadStore,
  WriteStore,
  PositionStats,
  MoveStats,
  PositionUpdate,
  StoreStats,
  GameResult,
} from '../types.js';
import { hashToBuffer } from '../zobrist.js';

// Key prefixes (same as RocksDB)
const POSITION_PREFIX = Buffer.from('p:');
const MOVE_PREFIX = Buffer.from('m:');

/**
 * Configuration for LMDB store
 */
export interface LmdbStoreConfig {
  /** Path to the database directory */
  path: string;
  /** Maximum database size in bytes (default: 10GB) */
  mapSize?: number;
  /** Whether to open in read-only mode (default: false) */
  readOnly?: boolean;
}

/**
 * LMDB-backed store for position and move statistics
 * Optimized for fast reads in the serving phase
 */
export class LmdbStore implements ReadStore, WriteStore {
  private db: RootDatabase<Buffer, Buffer>;
  private path: string;
  private readOnly: boolean;

  constructor(config: LmdbStoreConfig) {
    this.path = config.path;
    this.readOnly = config.readOnly ?? false;

    this.db = open({
      path: config.path,
      mapSize: config.mapSize ?? 10 * 1024 * 1024 * 1024, // 10GB default
      readOnly: this.readOnly,
      // Use Buffer for keys and values
      keyEncoding: 'binary',
      encoding: 'binary',
    }) as RootDatabase<Buffer, Buffer>;
  }

  // ===========================================================================
  // ReadStore Implementation
  // ===========================================================================

  async getPosition(hash: bigint): Promise<PositionStats | null> {
    const key = this.makePositionKey(hash);
    const value = this.db.get(key);

    if (!value) {
      return null;
    }

    return this.unpackPositionStats(value);
  }

  async getMoves(hash: bigint): Promise<MoveStats[]> {
    const moves: MoveStats[] = [];
    const prefix = Buffer.concat([MOVE_PREFIX, hashToBuffer(hash), Buffer.from(':')]);

    // LMDB range query
    for (const { key, value } of this.db.getRange({
      start: prefix,
      end: Buffer.concat([prefix, Buffer.alloc(256, 0xff)]),
    })) {
      if (!key.subarray(0, prefix.length).equals(prefix)) {
        break;
      }

      const stats = this.unpackMoveStats(value);
      stats.uci = key.subarray(prefix.length).toString('utf8');
      moves.push(stats);
    }

    // Sort by total games
    moves.sort((a, b) => {
      const totalA = a.white + a.draws + a.black;
      const totalB = b.white + b.draws + b.black;
      return totalB - totalA;
    });

    return moves;
  }

  async hasPosition(hash: bigint): Promise<boolean> {
    const key = this.makePositionKey(hash);
    return this.db.doesExist(key);
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async getStats(): Promise<StoreStats> {
    let positionCount = 0;
    let moveCount = 0;

    for (const { key } of this.db.getRange({})) {
      if (key[0] === POSITION_PREFIX[0] && key[1] === POSITION_PREFIX[1]) {
        positionCount++;
      } else if (key[0] === MOVE_PREFIX[0] && key[1] === MOVE_PREFIX[1]) {
        moveCount++;
      }
    }

    const sizeBytes = positionCount * 12 + moveCount * 24;

    return { positionCount, moveCount, sizeBytes };
  }

  // ===========================================================================
  // WriteStore Implementation (for compaction/direct writes)
  // ===========================================================================

  async incrementPosition(hash: bigint, result: GameResult): Promise<void> {
    if (this.readOnly) {
      throw new Error('Cannot write to read-only store');
    }

    const key = this.makePositionKey(hash);
    let stats = await this.getPosition(hash);

    if (!stats) {
      stats = { white: 0, draws: 0, black: 0 };
    }

    this.applyResult(stats, result);
    await this.db.put(key, this.packPositionStats(stats));
  }

  async incrementMove(
    hash: bigint,
    move: string,
    result: GameResult,
    rating?: number
  ): Promise<void> {
    if (this.readOnly) {
      throw new Error('Cannot write to read-only store');
    }

    const key = this.makeMoveKey(hash, move);
    const existing = this.db.get(key);

    let stats: MoveStats;
    if (existing) {
      stats = this.unpackMoveStats(existing);
      stats.uci = move;
    } else {
      stats = { uci: move, white: 0, draws: 0, black: 0, ratingSum: 0, games: 0 };
    }

    this.applyResultToMove(stats, result, rating);
    await this.db.put(key, this.packMoveStats(stats));
  }

  async batchWrite(updates: PositionUpdate[]): Promise<void> {
    if (this.readOnly) {
      throw new Error('Cannot write to read-only store');
    }

    // Accumulate updates
    const positionUpdates = new Map<string, PositionStats>();
    const moveUpdates = new Map<string, MoveStats>();

    for (const update of updates) {
      // Position update
      const posKey = this.makePositionKey(update.hash).toString('hex');
      let posStats = positionUpdates.get(posKey);

      if (!posStats) {
        const existing = await this.getPosition(update.hash);
        posStats = existing ?? { white: 0, draws: 0, black: 0 };
        positionUpdates.set(posKey, posStats);
      }

      this.applyResult(posStats, update.result);

      // Move update
      const moveKey = this.makeMoveKey(update.hash, update.move).toString('hex');
      let moveStats = moveUpdates.get(moveKey);

      if (!moveStats) {
        const key = this.makeMoveKey(update.hash, update.move);
        const existing = this.db.get(key);
        if (existing) {
          moveStats = this.unpackMoveStats(existing);
          moveStats.uci = update.move;
        } else {
          moveStats = {
            uci: update.move,
            white: 0,
            draws: 0,
            black: 0,
            ratingSum: 0,
            games: 0,
          };
        }
        moveUpdates.set(moveKey, moveStats);
      }

      this.applyResultToMove(moveStats, update.result, update.rating);
    }

    // Write all updates in a transaction
    await this.db.transaction(() => {
      for (const [keyHex, stats] of positionUpdates) {
        const key = Buffer.from(keyHex, 'hex');
        this.db.put(key, this.packPositionStats(stats));
      }

      for (const [keyHex, stats] of moveUpdates) {
        const key = Buffer.from(keyHex, 'hex');
        this.db.put(key, this.packMoveStats(stats));
      }
    });
  }

  async flush(): Promise<void> {
    // LMDB auto-flushes, but we can force a sync
    await this.db.flushed;
  }

  // ===========================================================================
  // Direct Write Methods (for compaction)
  // ===========================================================================

  /**
   * Put a position directly (used during compaction)
   */
  async putPosition(hash: bigint, stats: PositionStats): Promise<void> {
    const key = this.makePositionKey(hash);
    await this.db.put(key, this.packPositionStats(stats));
  }

  /**
   * Put a move directly (used during compaction)
   */
  async putMove(hash: bigint, uci: string, stats: MoveStats): Promise<void> {
    const key = this.makeMoveKey(hash, uci);
    await this.db.put(key, this.packMoveStats(stats));
  }

  /**
   * Put raw key-value pair (used during compaction)
   */
  async putRaw(key: Buffer, value: Buffer): Promise<void> {
    await this.db.put(key, value);
  }

  /**
   * Begin a write transaction for bulk operations
   */
  async transaction<T>(fn: () => T): Promise<T> {
    return this.db.transaction(fn);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private makePositionKey(hash: bigint): Buffer {
    return Buffer.concat([POSITION_PREFIX, hashToBuffer(hash)]);
  }

  private makeMoveKey(hash: bigint, move: string): Buffer {
    return Buffer.concat([
      MOVE_PREFIX,
      hashToBuffer(hash),
      Buffer.from(':'),
      Buffer.from(move, 'utf8'),
    ]);
  }

  private packPositionStats(stats: PositionStats): Buffer {
    const buf = Buffer.alloc(12);
    buf.writeUInt32LE(stats.white, 0);
    buf.writeUInt32LE(stats.draws, 4);
    buf.writeUInt32LE(stats.black, 8);
    return buf;
  }

  private unpackPositionStats(buf: Buffer): PositionStats {
    return {
      white: buf.readUInt32LE(0),
      draws: buf.readUInt32LE(4),
      black: buf.readUInt32LE(8),
    };
  }

  private packMoveStats(stats: MoveStats): Buffer {
    const buf = Buffer.alloc(24);
    buf.writeUInt32LE(stats.white, 0);
    buf.writeUInt32LE(stats.draws, 4);
    buf.writeUInt32LE(stats.black, 8);
    buf.writeBigUInt64LE(BigInt(stats.ratingSum), 12);
    buf.writeUInt32LE(stats.games, 20);
    return buf;
  }

  private unpackMoveStats(buf: Buffer): MoveStats {
    return {
      uci: '',
      white: buf.readUInt32LE(0),
      draws: buf.readUInt32LE(4),
      black: buf.readUInt32LE(8),
      ratingSum: Number(buf.readBigUInt64LE(12)),
      games: buf.readUInt32LE(20),
    };
  }

  private applyResult(stats: PositionStats, result: GameResult): void {
    switch (result) {
      case 'white':
        stats.white++;
        break;
      case 'black':
        stats.black++;
        break;
      case 'draw':
        stats.draws++;
        break;
    }
  }

  private applyResultToMove(stats: MoveStats, result: GameResult, rating?: number): void {
    switch (result) {
      case 'white':
        stats.white++;
        break;
      case 'black':
        stats.black++;
        break;
      case 'draw':
        stats.draws++;
        break;
    }

    stats.games++;
    if (rating !== undefined) {
      stats.ratingSum += rating;
    }
  }
}

/**
 * Open an LMDB store (convenience function)
 */
export function openLmdbStore(config: LmdbStoreConfig): LmdbStore {
  return new LmdbStore(config);
}


