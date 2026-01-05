/**
 * RocksDB Store
 *
 * Write-optimized persistent store using RocksDB (LSM tree).
 * Excellent for the indexing phase where we have billions of random writes.
 *
 * Key format:
 * - Position stats: "p:" + 8-byte hash
 * - Move stats: "m:" + 8-byte hash + ":" + move UCI
 *
 * Value format (packed binary):
 * - Position: white (4) + draws (4) + black (4) = 12 bytes
 * - Move: white (4) + draws (4) + black (4) + ratingSum (8) + games (4) = 24 bytes
 */

/// <reference path="./rocksdb.d.ts" />
import RocksDB from 'rocksdb';
import type {
  WriteStore,
  ReadStore,
  PositionStats,
  MoveStats,
  PositionUpdate,
  StoreStats,
  GameResult,
} from '../types.js';
import { hashToBuffer } from '../zobrist.js';

// Key prefixes
const POSITION_PREFIX = Buffer.from('p:');
const MOVE_PREFIX = Buffer.from('m:');

/**
 * Configuration for RocksDB store
 */
export interface RocksStoreConfig {
  /** Path to the database directory */
  path: string;
  /** Create database if it doesn't exist (default: true) */
  createIfMissing?: boolean;
  /** Error if database already exists (default: false) */
  errorIfExists?: boolean;
  /** Write buffer size in bytes (default: 64MB) */
  writeBufferSize?: number;
  /** Max write buffer count (default: 3) */
  maxWriteBufferNumber?: number;
  /** Enable compression (default: true) */
  compression?: boolean;
}

/**
 * RocksDB-backed store for position and move statistics
 */
export class RocksStore implements WriteStore, ReadStore {
  private db: RocksDB;
  private isOpen = false;
  private path: string;

  // Write batch for accumulated writes
  private pendingWrites: Map<string, Buffer> = new Map();
  private pendingBatchSize = 0;
  private readonly maxPendingBatchSize = 1000;

  constructor(config: RocksStoreConfig) {
    this.path = config.path;
    this.db = new RocksDB(config.path);
  }

  /**
   * Open the database
   */
  async open(config: RocksStoreConfig = { path: this.path }): Promise<void> {
    if (this.isOpen) return;

    const options = {
      createIfMissing: config.createIfMissing ?? true,
      errorIfExists: config.errorIfExists ?? false,
      writeBufferSize: config.writeBufferSize ?? 64 * 1024 * 1024,
      maxWriteBufferNumber: config.maxWriteBufferNumber ?? 3,
      compression: config.compression ?? true,
    };

    await new Promise<void>((resolve, reject) => {
      this.db.open(options, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.isOpen = true;
  }

  // ===========================================================================
  // Low-level promisified operations
  // ===========================================================================

  private dbGet(key: Buffer): Promise<Buffer | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(key, (err: Error | null, value?: Buffer) => {
        if (err) {
          // NotFound is not an error for us
          if (err.message?.includes('NotFound') || (err as NodeJS.ErrnoException).code === 'LEVEL_NOT_FOUND') {
            resolve(undefined);
          } else {
            reject(err);
          }
        } else {
          resolve(value);
        }
      });
    });
  }

  private dbPut(key: Buffer, value: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.put(key, value, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // ===========================================================================
  // WriteStore Implementation
  // ===========================================================================

  async incrementPosition(hash: bigint, result: GameResult): Promise<void> {
    const key = this.makePositionKey(hash);
    const keyStr = key.toString('hex');

    // Get current value (from pending or disk)
    let stats = await this.getPositionStats(hash);
    if (!stats) {
      stats = { white: 0, draws: 0, black: 0 };
    }

    // Apply increment
    this.applyResult(stats, result);

    // Store in pending writes
    this.pendingWrites.set(keyStr, this.packPositionStats(stats));
    this.pendingBatchSize++;

    // Auto-flush if batch is large
    if (this.pendingBatchSize >= this.maxPendingBatchSize) {
      await this.flush();
    }
  }

  async incrementMove(
    hash: bigint,
    move: string,
    result: GameResult,
    rating?: number
  ): Promise<void> {
    const key = this.makeMoveKey(hash, move);
    const keyStr = key.toString('hex');

    // Get current value
    let stats = await this.getMoveStats(hash, move);
    if (!stats) {
      stats = { uci: move, white: 0, draws: 0, black: 0, ratingSum: 0, games: 0 };
    }

    // Apply increment
    this.applyResultToMove(stats, result, rating);

    // Store in pending writes
    this.pendingWrites.set(keyStr, this.packMoveStats(stats));
    this.pendingBatchSize++;

    if (this.pendingBatchSize >= this.maxPendingBatchSize) {
      await this.flush();
    }
  }

  async batchWrite(updates: PositionUpdate[]): Promise<void> {
    // Accumulate all updates in memory first
    const positionUpdates = new Map<string, PositionStats>();
    const moveUpdates = new Map<string, MoveStats>();

    for (const update of updates) {
      // Position update
      const posKey = this.makePositionKey(update.hash).toString('hex');
      let posStats = positionUpdates.get(posKey);

      if (!posStats) {
        // Try to get from pending or disk
        const existing = await this.getPositionStats(update.hash);
        posStats = existing ?? { white: 0, draws: 0, black: 0 };
        positionUpdates.set(posKey, posStats);
      }

      this.applyResult(posStats, update.result);

      // Move update
      const moveKey = this.makeMoveKey(update.hash, update.move).toString('hex');
      let moveStats = moveUpdates.get(moveKey);

      if (!moveStats) {
        const existing = await this.getMoveStats(update.hash, update.move);
        moveStats = existing ?? {
          uci: update.move,
          white: 0,
          draws: 0,
          black: 0,
          ratingSum: 0,
          games: 0,
        };
        moveUpdates.set(moveKey, moveStats);
      }

      this.applyResultToMove(moveStats, update.result, update.rating);
    }

    // Add to pending writes
    for (const [keyStr, stats] of positionUpdates) {
      this.pendingWrites.set(keyStr, this.packPositionStats(stats));
    }

    for (const [keyStr, stats] of moveUpdates) {
      this.pendingWrites.set(keyStr, this.packMoveStats(stats));
    }

    this.pendingBatchSize += positionUpdates.size + moveUpdates.size;

    // Flush if batch is large
    if (this.pendingBatchSize >= this.maxPendingBatchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.pendingWrites.size === 0) return;

    const batch = this.db.batch();

    for (const [keyHex, value] of this.pendingWrites) {
      const key = Buffer.from(keyHex, 'hex');
      batch.put(key, value);
    }

    await new Promise<void>((resolve, reject) => {
      batch.write((err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.pendingWrites.clear();
    this.pendingBatchSize = 0;
  }

  // ===========================================================================
  // ReadStore Implementation
  // ===========================================================================

  async getPosition(hash: bigint): Promise<PositionStats | null> {
    return this.getPositionStats(hash);
  }

  async getMoves(hash: bigint): Promise<MoveStats[]> {
    const moves: MoveStats[] = [];
    const prefix = Buffer.concat([MOVE_PREFIX, hashToBuffer(hash), Buffer.from(':')]);
    const prefixStr = prefix.toString('hex');

    // Check pending writes first
    for (const [keyHex, value] of this.pendingWrites) {
      if (keyHex.startsWith(prefixStr)) {
        const stats = this.unpackMoveStats(value);
        // Extract move UCI from key
        const key = Buffer.from(keyHex, 'hex');
        stats.uci = key.subarray(prefix.length).toString('utf8');
        moves.push(stats);
      }
    }

    // Scan disk
    const seenKeys = new Set(
      Array.from(this.pendingWrites.keys()).filter((k) => k.startsWith(prefixStr))
    );

    await new Promise<void>((resolve, reject) => {
      const iterator = this.db.iterator({
        gte: prefix,
        lte: Buffer.concat([prefix, Buffer.alloc(256, 0xff)]),
      });

      const next = (): void => {
        iterator.next((err: Error | null, key?: Buffer, value?: Buffer) => {
          if (err) {
            iterator.end(() => reject(err));
            return;
          }

          if (!key || !value) {
            iterator.end(() => resolve());
            return;
          }

          // Check if this key is in pending (already added)
          const keyHex = key.toString('hex');
          if (!seenKeys.has(keyHex)) {
            const stats = this.unpackMoveStats(value);
            stats.uci = key.subarray(prefix.length).toString('utf8');
            moves.push(stats);
          }

          next();
        });
      };

      next();
    });

    // Sort by total games
    moves.sort((a, b) => {
      const totalA = a.white + a.draws + a.black;
      const totalB = b.white + b.draws + b.black;
      return totalB - totalA;
    });

    return moves;
  }

  async hasPosition(hash: bigint): Promise<boolean> {
    const stats = await this.getPositionStats(hash);
    return stats !== null;
  }

  async close(): Promise<void> {
    if (!this.isOpen) return;

    await this.flush();

    await new Promise<void>((resolve, reject) => {
      this.db.close((err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.isOpen = false;
  }

  async getStats(): Promise<StoreStats> {
    let positionCount = 0;
    let moveCount = 0;

    await new Promise<void>((resolve, reject) => {
      const iterator = this.db.iterator();

      const next = (): void => {
        iterator.next((err: Error | null, key?: Buffer) => {
          if (err) {
            iterator.end(() => reject(err));
            return;
          }

          if (!key) {
            iterator.end(() => resolve());
            return;
          }

          if (key[0] === POSITION_PREFIX[0] && key[1] === POSITION_PREFIX[1]) {
            positionCount++;
          } else if (key[0] === MOVE_PREFIX[0] && key[1] === MOVE_PREFIX[1]) {
            moveCount++;
          }

          next();
        });
      };

      next();
    });

    // Estimate size (rough)
    const sizeBytes = positionCount * 12 + moveCount * 24;

    return { positionCount, moveCount, sizeBytes };
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

  private async getPositionStats(hash: bigint): Promise<PositionStats | null> {
    const key = this.makePositionKey(hash);
    const keyStr = key.toString('hex');

    // Check pending writes first
    const pending = this.pendingWrites.get(keyStr);
    if (pending) {
      return this.unpackPositionStats(pending);
    }

    // Check disk
    const value = await this.dbGet(key);
    if (value) {
      return this.unpackPositionStats(value);
    }

    return null;
  }

  private async getMoveStats(hash: bigint, move: string): Promise<MoveStats | null> {
    const key = this.makeMoveKey(hash, move);
    const keyStr = key.toString('hex');

    // Check pending writes first
    const pending = this.pendingWrites.get(keyStr);
    if (pending) {
      const stats = this.unpackMoveStats(pending);
      stats.uci = move;
      return stats;
    }

    // Check disk
    const value = await this.dbGet(key);
    if (value) {
      const stats = this.unpackMoveStats(value);
      stats.uci = move;
      return stats;
    }

    return null;
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
      uci: '', // Will be filled in by caller
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
 * Open a RocksDB store (convenience function)
 */
export async function openRocksStore(config: RocksStoreConfig): Promise<RocksStore> {
  const store = new RocksStore(config);
  await store.open(config);
  return store;
}
