/**
 * Compactor
 *
 * Converts data from RocksDB (write-optimized) to LMDB (read-optimized).
 *
 * Process:
 * 1. Open source RocksDB
 * 2. Open/create target LMDB
 * 3. Stream all key-value pairs from RocksDB
 * 4. Write to LMDB in batches
 * 5. Verify integrity
 *
 * This is a one-time operation after indexing is complete.
 */

import RocksDB from 'rocksdb';
import { LmdbStore, openLmdbStore } from './lmdb-store.js';
import type { StoreStats } from '../types.js';

/// <reference path="./rocksdb.d.ts" />

/**
 * Configuration for compaction
 */
export interface CompactorConfig {
  /** Path to source RocksDB */
  sourcePath: string;
  /** Path to target LMDB */
  targetPath: string;
  /** Batch size for writes (default: 10000) */
  batchSize?: number;
  /** Progress callback */
  onProgress?: (progress: CompactionProgress) => void;
  /** Report interval in entries (default: 100000) */
  progressInterval?: number;
  /** Target LMDB map size (default: 10GB) */
  mapSize?: number;
}

/**
 * Progress information during compaction
 */
export interface CompactionProgress {
  /** Entries processed so far */
  entriesProcessed: number;
  /** Positions copied */
  positionsCopied: number;
  /** Moves copied */
  movesCopied: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Phase */
  phase: 'copying' | 'verifying' | 'complete';
}

/**
 * Result of compaction
 */
export interface CompactionResult {
  /** Whether compaction was successful */
  success: boolean;
  /** Total entries copied */
  entriesCopied: number;
  /** Positions copied */
  positionsCopied: number;
  /** Moves copied */
  movesCopied: number;
  /** Time taken in milliseconds */
  elapsedMs: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Compact RocksDB to LMDB
 *
 * @param config - Compaction configuration
 * @returns Compaction result
 *
 * @example
 * const result = await compact({
 *   sourcePath: './data/rocks-index',
 *   targetPath: './data/lmdb-index',
 *   onProgress: (p) => console.log(`${p.entriesProcessed} entries...`),
 * });
 */
export async function compact(config: CompactorConfig): Promise<CompactionResult> {
  const batchSize = config.batchSize ?? 10000;
  const progressInterval = config.progressInterval ?? 100000;
  const startTime = Date.now();

  let positionsCopied = 0;
  let movesCopied = 0;
  let entriesCopied = 0;

  // Open source RocksDB
  const rocksDb = new RocksDB(config.sourcePath);

  try {
    await new Promise<void>((resolve, reject) => {
      rocksDb.open({ readOnly: true }, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (err) {
    return {
      success: false,
      entriesCopied: 0,
      positionsCopied: 0,
      movesCopied: 0,
      elapsedMs: Date.now() - startTime,
      error: `Failed to open source RocksDB: ${err}`,
    };
  }

  // Open target LMDB
  let lmdbStore: LmdbStore;
  try {
    lmdbStore = openLmdbStore({
      path: config.targetPath,
      mapSize: config.mapSize,
    });
  } catch (err) {
    await new Promise<void>((resolve) => rocksDb.close(() => resolve()));
    return {
      success: false,
      entriesCopied: 0,
      positionsCopied: 0,
      movesCopied: 0,
      elapsedMs: Date.now() - startTime,
      error: `Failed to open target LMDB: ${err}`,
    };
  }

  // Stream entries from RocksDB to LMDB
  let batch: Array<{ key: Buffer; value: Buffer }> = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;

    await lmdbStore.transaction(() => {
      for (const { key, value } of batch) {
        lmdbStore.putRaw(key, value);
      }
    });

    batch = [];
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const iterator = rocksDb.iterator();

      const processNext = (): void => {
        iterator.next((err: Error | null, key?: Buffer, value?: Buffer) => {
          if (err) {
            iterator.end(() => reject(err));
            return;
          }

          if (!key || !value) {
            // End of iteration
            iterator.end(async () => {
              try {
                await flushBatch();
                resolve();
              } catch (e) {
                reject(e);
              }
            });
            return;
          }

          // Add to batch
          batch.push({ key, value });

          // Track type
          if (key[0] === 0x70 && key[1] === 0x3a) {
            // 'p:'
            positionsCopied++;
          } else if (key[0] === 0x6d && key[1] === 0x3a) {
            // 'm:'
            movesCopied++;
          }
          entriesCopied++;

          // Flush batch if full
          if (batch.length >= batchSize) {
            flushBatch()
              .then(() => {
                // Report progress
                if (config.onProgress && entriesCopied % progressInterval === 0) {
                  config.onProgress({
                    entriesProcessed: entriesCopied,
                    positionsCopied,
                    movesCopied,
                    elapsedMs: Date.now() - startTime,
                    phase: 'copying',
                  });
                }
                processNext();
              })
              .catch(reject);
          } else {
            // Continue without async
            if (config.onProgress && entriesCopied % progressInterval === 0) {
              config.onProgress({
                entriesProcessed: entriesCopied,
                positionsCopied,
                movesCopied,
                elapsedMs: Date.now() - startTime,
                phase: 'copying',
              });
            }
            processNext();
          }
        });
      };

      processNext();
    });

    // Sync LMDB
    await lmdbStore.flush();

    // Report completion
    if (config.onProgress) {
      config.onProgress({
        entriesProcessed: entriesCopied,
        positionsCopied,
        movesCopied,
        elapsedMs: Date.now() - startTime,
        phase: 'complete',
      });
    }

    // Close databases
    await new Promise<void>((resolve) => rocksDb.close(() => resolve()));
    await lmdbStore.close();

    return {
      success: true,
      entriesCopied,
      positionsCopied,
      movesCopied,
      elapsedMs: Date.now() - startTime,
    };
  } catch (err) {
    await new Promise<void>((resolve) => rocksDb.close(() => resolve()));
    await lmdbStore.close();

    return {
      success: false,
      entriesCopied,
      positionsCopied,
      movesCopied,
      elapsedMs: Date.now() - startTime,
      error: `Compaction failed: ${err}`,
    };
  }
}

/**
 * Verify that two stores have identical data
 *
 * @param storePath1 - Path to first store (RocksDB or LMDB)
 * @param storePath2 - Path to second store (LMDB)
 * @returns Whether the stores are identical
 */
export async function verifyCompaction(
  rocksPath: string,
  lmdbPath: string
): Promise<{ identical: boolean; differences: string[] }> {
  const differences: string[] = [];

  // Open RocksDB
  const rocksDb = new RocksDB(rocksPath);
  await new Promise<void>((resolve, reject) => {
    rocksDb.open({ readOnly: true }, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Open LMDB
  const lmdbStore = openLmdbStore({ path: lmdbPath, readOnly: true });

  // Compare entry counts
  let rocksCount = 0;
  await new Promise<void>((resolve, reject) => {
    const iterator = rocksDb.iterator();
    const countNext = (): void => {
      iterator.next((err: Error | null, key?: Buffer) => {
        if (err) {
          iterator.end(() => reject(err));
          return;
        }
        if (!key) {
          iterator.end(() => resolve());
          return;
        }
        rocksCount++;
        countNext();
      });
    };
    countNext();
  });

  const lmdbStats = await lmdbStore.getStats();
  const lmdbCount = lmdbStats.positionCount + lmdbStats.moveCount;

  if (rocksCount !== lmdbCount) {
    differences.push(`Entry count mismatch: RocksDB=${rocksCount}, LMDB=${lmdbCount}`);
  }

  // Cleanup
  await new Promise<void>((resolve) => rocksDb.close(() => resolve()));
  await lmdbStore.close();

  return {
    identical: differences.length === 0,
    differences,
  };
}


