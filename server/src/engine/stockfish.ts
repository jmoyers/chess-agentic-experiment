/**
 * Stockfish Service
 *
 * High-level service for chess position analysis using Stockfish.
 * Supports streaming MultiPV analysis with configurable options.
 */

import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { UCIEngine, type ParsedInfo, type ParsedBestMove } from './uci.js';
import type {
  AnalysisOptions,
  AnalysisLine,
  AnalysisInfo,
  AnalysisComplete,
  AnalysisState,
  EngineInfo,
  StockfishConfig,
  StockfishEvents,
  DEFAULT_CONFIG,
} from './types.js';

// Re-export types for convenience
export type {
  AnalysisOptions,
  AnalysisLine,
  AnalysisInfo,
  AnalysisComplete,
  EngineInfo,
  StockfishConfig,
  StockfishEvents,
};

/**
 * Default configuration
 */
const defaultConfig: Required<StockfishConfig> = {
  binaryPath: './bin/stockfish',
  defaultThreads: 1,
  defaultHash: 128,
  defaultMultiPv: 1,
  maxDepth: 26,
  initTimeout: 10000,
  stopTimeout: 5000,
};

/**
 * StockfishService - High-level chess analysis service
 *
 * Events:
 * - 'info': Intermediate analysis updates (streaming)
 * - 'bestmove': Final result when analysis completes
 * - 'error': Error occurred
 * - 'ready': Engine initialized and ready
 *
 * @example
 * ```typescript
 * const stockfish = new StockfishService();
 * await stockfish.init();
 *
 * // Streaming analysis
 * stockfish.on('info', (info) => console.log('Depth:', info.currentDepth));
 * stockfish.on('bestmove', (result) => console.log('Best:', result.bestMove));
 * await stockfish.startAnalysis(fen, { depth: 20, multiPv: 3 });
 *
 * // Or one-shot analysis
 * const result = await stockfish.analyze(fen, { movetime: 5000 });
 * ```
 */
export class StockfishService extends EventEmitter {
  private engine: UCIEngine | null = null;
  private engineInfo: EngineInfo | null = null;
  private config: Required<StockfishConfig>;
  private currentAnalysis: AnalysisState | null = null;
  private isInitialized: boolean = false;
  private currentMultiPv: number = 1;

  constructor(config: StockfishConfig = {}) {
    super();
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Initialize the engine
   */
  async init(): Promise<EngineInfo> {
    if (this.isInitialized) {
      return this.engineInfo!;
    }

    // Resolve binary path
    const binaryPath = this.resolveBinaryPath();

    // Check binary exists
    if (!fs.existsSync(binaryPath)) {
      throw new Error(
        `Stockfish binary not found at: ${binaryPath}\n` +
          'Run: cd server && ./scripts/build-stockfish.sh'
      );
    }

    // Create and spawn engine
    this.engine = new UCIEngine(binaryPath);
    this.engine.spawn();

    // Set up event forwarding
    this.setupEngineEvents();

    // Initialize UCI
    this.engineInfo = await this.engine.initUCI(this.config.initTimeout);
    await this.engine.isReady();

    // Apply default settings
    await this.applyDefaultSettings();

    this.isInitialized = true;
    this.emit('ready', this.engineInfo);

    return this.engineInfo;
  }

  /**
   * Resolve the path to the Stockfish binary
   */
  private resolveBinaryPath(): string {
    // Check environment variable first
    const envPath = process.env.STOCKFISH_PATH;
    if (envPath) {
      return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
    }

    // Use config path
    const configPath = this.config.binaryPath;

    // If relative, resolve from server directory
    if (!path.isAbsolute(configPath)) {
      // Try to find the server directory
      const serverDir = this.findServerDir();
      return path.resolve(serverDir, configPath);
    }

    return configPath;
  }

  /**
   * Find the server directory
   */
  private findServerDir(): string {
    // Start from current directory and look for package.json
    let dir = process.cwd();

    // Walk up looking for server directory indicators
    for (let i = 0; i < 5; i++) {
      const packagePath = path.join(dir, 'package.json');
      if (fs.existsSync(packagePath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
          if (pkg.name === '@chess/server') {
            return dir;
          }
        } catch {
          // Continue searching
        }
      }

      // Check if we're in a server subdirectory
      const serverBin = path.join(dir, 'server', 'bin', 'stockfish');
      if (fs.existsSync(serverBin)) {
        return path.join(dir, 'server');
      }

      // Check sibling
      const siblingBin = path.join(dir, 'bin', 'stockfish');
      if (fs.existsSync(siblingBin)) {
        return dir;
      }

      dir = path.dirname(dir);
    }

    // Fallback to cwd
    return process.cwd();
  }

  /**
   * Set up event handlers from UCI engine
   */
  private setupEngineEvents(): void {
    if (!this.engine) return;

    // Forward info events during analysis
    this.engine.on('info', (parsed: ParsedInfo) => {
      if (this.currentAnalysis) {
        this.handleInfoUpdate(parsed);
      }
    });

    // Handle bestmove (analysis complete)
    this.engine.on('bestmove', (result: ParsedBestMove) => {
      if (this.currentAnalysis) {
        this.handleBestMove(result);
      }
    });

    // Handle errors
    this.engine.on('error', (error: Error) => {
      this.emit('error', error);
    });

    // Handle unexpected exit
    this.engine.on('exit', (code: number | null) => {
      if (this.isInitialized) {
        this.isInitialized = false;
        this.emit('error', new Error(`Engine exited unexpectedly with code ${code}`));
      }
    });
  }

  /**
   * Apply default engine settings
   */
  private async applyDefaultSettings(): Promise<void> {
    if (!this.engine) return;

    // Set threads
    const threads = process.env.STOCKFISH_THREADS
      ? parseInt(process.env.STOCKFISH_THREADS, 10)
      : this.config.defaultThreads;
    await this.engine.setOption('Threads', threads);

    // Set hash
    const hash = process.env.STOCKFISH_HASH
      ? parseInt(process.env.STOCKFISH_HASH, 10)
      : this.config.defaultHash;
    await this.engine.setOption('Hash', hash);

    // Set default MultiPV
    const multiPv = process.env.STOCKFISH_MULTI_PV
      ? parseInt(process.env.STOCKFISH_MULTI_PV, 10)
      : this.config.defaultMultiPv;
    await this.engine.setOption('MultiPV', multiPv);
    this.currentMultiPv = multiPv;
  }

  /**
   * Handle info line during analysis
   */
  private handleInfoUpdate(parsed: ParsedInfo): void {
    if (!this.currentAnalysis) return;

    // Skip info lines without useful data
    if (parsed.depth === undefined || parsed.pv === undefined || parsed.pv.length === 0) {
      // Still update hashfull if available
      if (parsed.hashfull !== undefined) {
        this.currentAnalysis.hashfull = parsed.hashfull;
      }
      return;
    }

    // Determine line number (MultiPV)
    const pvNumber = parsed.multipv || 1;

    // Create analysis line
    const line: AnalysisLine = {
      pv: pvNumber,
      depth: parsed.depth,
      seldepth: parsed.seldepth || parsed.depth,
      score: parsed.score || { type: 'cp', value: 0 },
      nodes: parsed.nodes || 0,
      nps: parsed.nps || 0,
      time: parsed.time || 0,
      moves: parsed.pv,
    };

    // Update current analysis state
    this.currentAnalysis.lines.set(pvNumber, line);

    if (parsed.hashfull !== undefined) {
      this.currentAnalysis.hashfull = parsed.hashfull;
    }

    // Check if we have all lines for this depth (emit info event)
    const allLinesAtDepth = this.checkCompleteDepth(parsed.depth);
    if (allLinesAtDepth) {
      this.currentAnalysis.lastCompleteDepth = parsed.depth;
      this.emitAnalysisInfo();
    }
  }

  /**
   * Check if we have all expected lines at a given depth
   */
  private checkCompleteDepth(depth: number): boolean {
    if (!this.currentAnalysis) return false;

    const expectedLines = this.currentAnalysis.expectedLines;

    // Count lines at this depth
    let count = 0;
    for (const [, line] of this.currentAnalysis.lines) {
      if (line.depth >= depth) {
        count++;
      }
    }

    return count >= expectedLines;
  }

  /**
   * Emit current analysis info
   */
  private emitAnalysisInfo(): void {
    if (!this.currentAnalysis) return;

    const lines = Array.from(this.currentAnalysis.lines.values())
      .sort((a, b) => a.pv - b.pv);

    const info: AnalysisInfo = {
      fen: this.currentAnalysis.fen,
      lines,
      currentDepth: this.currentAnalysis.lastCompleteDepth,
      hashfull: this.currentAnalysis.hashfull,
      elapsed: Date.now() - this.currentAnalysis.startTime,
    };

    this.emit('info', info);
  }

  /**
   * Handle bestmove (analysis complete)
   */
  private handleBestMove(result: ParsedBestMove): void {
    if (!this.currentAnalysis) return;

    const lines = Array.from(this.currentAnalysis.lines.values())
      .sort((a, b) => a.pv - b.pv);

    const complete: AnalysisComplete = {
      fen: this.currentAnalysis.fen,
      bestMove: result.bestmove,
      ponder: result.ponder,
      lines,
      totalTime: Date.now() - this.currentAnalysis.startTime,
    };

    // Clear current analysis before emitting
    this.currentAnalysis = null;

    this.emit('bestmove', complete);
  }

  /**
   * Start streaming analysis
   *
   * Analysis will run until:
   * - Depth limit reached (if specified, capped at maxDepth)
   * - Time limit reached (if specified)
   * - Node limit reached (if specified)
   * - stopAnalysis() is called (if infinite, still capped at maxDepth)
   */
  async startAnalysis(fen: string, options: AnalysisOptions = {}): Promise<void> {
    this.ensureInitialized();

    // Stop any existing analysis
    if (this.currentAnalysis) {
      await this.stopAnalysis();
    }

    // Update MultiPV if changed
    const multiPv = options.multiPv || this.currentMultiPv;
    if (multiPv !== this.currentMultiPv) {
      await this.engine!.setOption('MultiPV', multiPv);
      this.currentMultiPv = multiPv;
    }

    // Update threads/hash if specified
    if (options.threads !== undefined) {
      await this.engine!.setOption('Threads', options.threads);
    }
    if (options.hash !== undefined) {
      await this.engine!.setOption('Hash', options.hash);
    }

    // Initialize analysis state
    this.currentAnalysis = {
      fen,
      lines: new Map(),
      expectedLines: multiPv,
      startTime: Date.now(),
      lastCompleteDepth: 0,
      hashfull: 0,
    };

    // Set position
    this.engine!.position(fen);

    // Apply max depth limit - always cap at configured max depth
    // This prevents infinite analysis from running forever
    let effectiveDepth = options.depth;
    if (effectiveDepth === undefined || options.infinite) {
      effectiveDepth = this.config.maxDepth;
    } else {
      effectiveDepth = Math.min(effectiveDepth, this.config.maxDepth);
    }

    // Start search (use depth instead of infinite to ensure termination)
    this.engine!.go({
      depth: effectiveDepth,
      movetime: options.movetime,
      nodes: options.nodes,
      infinite: false, // Never use infinite - always use depth limit
      searchmoves: options.searchMoves,
    });
  }

  /**
   * Stop current analysis and return final result
   */
  async stopAnalysis(): Promise<AnalysisComplete | null> {
    if (!this.currentAnalysis) {
      return null;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force result even without bestmove
        if (this.currentAnalysis) {
          const lines = Array.from(this.currentAnalysis.lines.values())
            .sort((a, b) => a.pv - b.pv);

          const result: AnalysisComplete = {
            fen: this.currentAnalysis.fen,
            bestMove: lines[0]?.moves[0] || '0000',
            lines,
            totalTime: Date.now() - this.currentAnalysis.startTime,
          };

          this.currentAnalysis = null;
          resolve(result);
        }
      }, this.config.stopTimeout);

      const handler = (result: AnalysisComplete) => {
        clearTimeout(timeout);
        this.removeListener('bestmove', handler);
        resolve(result);
      };

      this.once('bestmove', handler);
      this.engine?.stop();
    });
  }

  /**
   * One-shot analysis (convenience method)
   *
   * Starts analysis and waits for completion.
   * For streaming updates, use startAnalysis() and listen to 'info' events.
   */
  async analyze(fen: string, options: AnalysisOptions = {}): Promise<AnalysisComplete> {
    // Ensure at least one limit is set, cap at maxDepth
    if (!options.depth && !options.movetime && !options.nodes) {
      options.depth = Math.min(20, this.config.maxDepth);
    } else if (options.depth) {
      options.depth = Math.min(options.depth, this.config.maxDepth);
    }

    return new Promise((resolve, reject) => {
      const handler = (result: AnalysisComplete) => {
        this.removeListener('error', errorHandler);
        resolve(result);
      };

      const errorHandler = (error: Error) => {
        this.removeListener('bestmove', handler);
        reject(error);
      };

      this.once('bestmove', handler);
      this.once('error', errorHandler);

      this.startAnalysis(fen, options).catch(reject);
    });
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.engine?.running === true;
  }

  /**
   * Check if currently analyzing
   */
  isAnalyzing(): boolean {
    return this.currentAnalysis !== null;
  }

  /**
   * Get engine info
   */
  getEngineInfo(): EngineInfo | null {
    return this.engineInfo;
  }

  /**
   * Get current analysis state (for debugging)
   */
  getCurrentAnalysis(): AnalysisState | null {
    return this.currentAnalysis;
  }

  /**
   * Set a UCI option
   */
  async setOption(name: string, value: string | number | boolean): Promise<void> {
    this.ensureInitialized();
    await this.engine!.setOption(name, value);

    // Track MultiPV changes
    if (name === 'MultiPV') {
      this.currentMultiPv = typeof value === 'number' ? value : parseInt(String(value), 10);
    }
  }

  /**
   * Clear hash table (for new game)
   */
  async newGame(): Promise<void> {
    this.ensureInitialized();
    await this.engine!.newGame();
  }

  /**
   * Shutdown the engine
   */
  async quit(): Promise<void> {
    if (this.currentAnalysis) {
      await this.stopAnalysis();
    }

    this.engine?.quit();
    this.engine = null;
    this.engineInfo = null;
    this.isInitialized = false;
  }

  /**
   * Ensure engine is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.engine) {
      throw new Error('Engine not initialized. Call init() first.');
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: StockfishService | null = null;

/**
 * Get the singleton StockfishService instance
 *
 * Note: Call await getStockfishService().init() before using analysis methods
 */
export function getStockfishService(): StockfishService {
  if (!instance) {
    instance = new StockfishService();
  }
  return instance;
}

/**
 * Initialize and get the singleton StockfishService instance
 */
export async function initStockfishService(config?: StockfishConfig): Promise<StockfishService> {
  if (!instance) {
    instance = new StockfishService(config);
  }
  await instance.init();
  return instance;
}
