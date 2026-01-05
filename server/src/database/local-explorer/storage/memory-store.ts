/**
 * In-Memory Store
 *
 * A simple in-memory implementation of the WriteStore and ReadStore interfaces.
 * Useful for:
 * - Testing the indexer logic
 * - Small datasets that fit in memory
 * - Development and debugging
 *
 * Not suitable for:
 * - Large datasets (millions of positions)
 * - Persistence across restarts
 */

import type {
  WriteStore,
  ReadStore,
  PositionStats,
  MoveStats,
  PositionUpdate,
  StoreStats,
  GameResult,
} from '../types.js';

/**
 * Internal representation of move statistics
 */
interface InternalMoveStats {
  white: number;
  draws: number;
  black: number;
  ratingSum: number;
  games: number;
}

/**
 * Internal representation of position data
 */
interface InternalPositionData {
  white: number;
  draws: number;
  black: number;
  moves: Map<string, InternalMoveStats>;
}

/**
 * In-memory store implementing both read and write interfaces
 */
export class MemoryStore implements WriteStore, ReadStore {
  private positions: Map<bigint, InternalPositionData> = new Map();
  private moveCount = 0;

  // ===========================================================================
  // WriteStore Implementation
  // ===========================================================================

  async incrementPosition(hash: bigint, result: GameResult): Promise<void> {
    const pos = this.getOrCreatePosition(hash);
    this.applyResult(pos, result);
  }

  async incrementMove(
    hash: bigint,
    move: string,
    result: GameResult,
    rating?: number
  ): Promise<void> {
    const pos = this.getOrCreatePosition(hash);
    let moveStats = pos.moves.get(move);

    if (!moveStats) {
      moveStats = { white: 0, draws: 0, black: 0, ratingSum: 0, games: 0 };
      pos.moves.set(move, moveStats);
      this.moveCount++;
    }

    this.applyResultToMove(moveStats, result, rating);
  }

  async batchWrite(updates: PositionUpdate[]): Promise<void> {
    for (const update of updates) {
      await this.incrementPosition(update.hash, update.result);
      await this.incrementMove(update.hash, update.move, update.result, update.rating);
    }
  }

  async flush(): Promise<void> {
    // No-op for in-memory store
  }

  // ===========================================================================
  // ReadStore Implementation
  // ===========================================================================

  async getPosition(hash: bigint): Promise<PositionStats | null> {
    const pos = this.positions.get(hash);
    if (!pos) return null;

    return {
      white: pos.white,
      draws: pos.draws,
      black: pos.black,
    };
  }

  async getMoves(hash: bigint): Promise<MoveStats[]> {
    const pos = this.positions.get(hash);
    if (!pos) return [];

    const moves: MoveStats[] = [];

    for (const [uci, stats] of pos.moves) {
      moves.push({
        uci,
        white: stats.white,
        draws: stats.draws,
        black: stats.black,
        ratingSum: stats.ratingSum,
        games: stats.games,
      });
    }

    // Sort by total games (most popular first)
    moves.sort((a, b) => {
      const totalA = a.white + a.draws + a.black;
      const totalB = b.white + b.draws + b.black;
      return totalB - totalA;
    });

    return moves;
  }

  async hasPosition(hash: bigint): Promise<boolean> {
    return this.positions.has(hash);
  }

  async close(): Promise<void> {
    // No-op for in-memory store
  }

  async getStats(): Promise<StoreStats> {
    return {
      positionCount: this.positions.size,
      moveCount: this.moveCount,
      sizeBytes: this.estimateMemoryUsage(),
    };
  }

  // ===========================================================================
  // Additional Methods (for testing/debugging)
  // ===========================================================================

  /**
   * Clear all data
   */
  clear(): void {
    this.positions.clear();
    this.moveCount = 0;
  }

  /**
   * Get raw position data (for testing)
   */
  getRawPosition(hash: bigint): InternalPositionData | undefined {
    return this.positions.get(hash);
  }

  /**
   * Export all data (for debugging)
   */
  exportAll(): Map<bigint, InternalPositionData> {
    return new Map(this.positions);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private getOrCreatePosition(hash: bigint): InternalPositionData {
    let pos = this.positions.get(hash);

    if (!pos) {
      pos = {
        white: 0,
        draws: 0,
        black: 0,
        moves: new Map(),
      };
      this.positions.set(hash, pos);
    }

    return pos;
  }

  private applyResult(pos: InternalPositionData, result: GameResult): void {
    switch (result) {
      case 'white':
        pos.white++;
        break;
      case 'black':
        pos.black++;
        break;
      case 'draw':
        pos.draws++;
        break;
    }
  }

  private applyResultToMove(
    stats: InternalMoveStats,
    result: GameResult,
    rating?: number
  ): void {
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

  private estimateMemoryUsage(): number {
    // Rough estimate: 100 bytes per position + 50 bytes per move
    return this.positions.size * 100 + this.moveCount * 50;
  }
}

