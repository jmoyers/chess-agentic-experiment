/**
 * UCI Protocol Implementation
 *
 * Low-level communication with UCI chess engines via child process.
 * Handles spawning, line-buffered I/O, and command/response patterns.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type { EngineInfo, EngineOption, AnalysisLine, EngineScore } from './types.js';

// =============================================================================
// UCI Line Parser
// =============================================================================

/**
 * Parsed UCI info line
 */
export interface ParsedInfo {
  depth?: number;
  seldepth?: number;
  multipv?: number;
  score?: EngineScore;
  nodes?: number;
  nps?: number;
  hashfull?: number;
  time?: number;
  pv?: string[];
  currmove?: string;
  currmovenumber?: number;
  string?: string;
}

/**
 * Parsed bestmove line
 */
export interface ParsedBestMove {
  bestmove: string;
  ponder?: string;
}

/**
 * Parse a UCI info line into structured data
 *
 * Example input:
 * "info depth 24 seldepth 32 multipv 1 score cp 35 nodes 12345678 nps 2500000 hashfull 450 time 4938 pv e2e4 e7e5 g1f3"
 */
export function parseInfoLine(line: string): ParsedInfo | null {
  if (!line.startsWith('info ')) {
    return null;
  }

  const result: ParsedInfo = {};
  const tokens = line.slice(5).split(' ');

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    switch (token) {
      case 'depth':
        result.depth = parseInt(tokens[++i], 10);
        break;

      case 'seldepth':
        result.seldepth = parseInt(tokens[++i], 10);
        break;

      case 'multipv':
        result.multipv = parseInt(tokens[++i], 10);
        break;

      case 'score':
        i++;
        if (tokens[i] === 'cp') {
          result.score = { type: 'cp', value: parseInt(tokens[++i], 10) };
        } else if (tokens[i] === 'mate') {
          result.score = { type: 'mate', value: parseInt(tokens[++i], 10) };
        }
        // Skip optional bounds (upperbound/lowerbound)
        while (i + 1 < tokens.length && (tokens[i + 1] === 'upperbound' || tokens[i + 1] === 'lowerbound')) {
          i++;
        }
        break;

      case 'nodes':
        result.nodes = parseInt(tokens[++i], 10);
        break;

      case 'nps':
        result.nps = parseInt(tokens[++i], 10);
        break;

      case 'hashfull':
        result.hashfull = parseInt(tokens[++i], 10);
        break;

      case 'time':
        result.time = parseInt(tokens[++i], 10);
        break;

      case 'pv':
        // PV is the rest of the line
        result.pv = tokens.slice(i + 1);
        i = tokens.length; // End parsing
        break;

      case 'currmove':
        result.currmove = tokens[++i];
        break;

      case 'currmovenumber':
        result.currmovenumber = parseInt(tokens[++i], 10);
        break;

      case 'string':
        // String is the rest of the line
        result.string = tokens.slice(i + 1).join(' ');
        i = tokens.length;
        break;

      default:
        // Unknown token, skip
        break;
    }
    i++;
  }

  return result;
}

/**
 * Parse a bestmove line
 *
 * Example: "bestmove e2e4 ponder e7e5"
 */
export function parseBestMove(line: string): ParsedBestMove | null {
  if (!line.startsWith('bestmove ')) {
    return null;
  }

  const tokens = line.split(' ');
  const result: ParsedBestMove = {
    bestmove: tokens[1],
  };

  if (tokens[2] === 'ponder' && tokens[3]) {
    result.ponder = tokens[3];
  }

  return result;
}

/**
 * Parse UCI option line
 *
 * Example: "option name Hash type spin default 16 min 1 max 33554432"
 */
export function parseOptionLine(line: string): EngineOption | null {
  if (!line.startsWith('option name ')) {
    return null;
  }

  const nameMatch = line.match(/^option name (.+?) type (\w+)/);
  if (!nameMatch) {
    return null;
  }

  const option: EngineOption = {
    name: nameMatch[1],
    type: nameMatch[2] as EngineOption['type'],
  };

  // Parse default value
  const defaultMatch = line.match(/default ([^\s]+)/);
  if (defaultMatch) {
    const defaultVal = defaultMatch[1];
    if (option.type === 'spin') {
      option.default = parseInt(defaultVal, 10);
    } else if (option.type === 'check') {
      option.default = defaultVal === 'true';
    } else {
      option.default = defaultVal === '<empty>' ? '' : defaultVal;
    }
  }

  // Parse min/max for spin
  if (option.type === 'spin') {
    const minMatch = line.match(/min (\d+)/);
    const maxMatch = line.match(/max (\d+)/);
    if (minMatch) option.min = parseInt(minMatch[1], 10);
    if (maxMatch) option.max = parseInt(maxMatch[1], 10);
  }

  // Parse var for combo
  if (option.type === 'combo') {
    const vars: string[] = [];
    const varMatches = line.matchAll(/var ([^\s]+)/g);
    for (const match of varMatches) {
      vars.push(match[1]);
    }
    if (vars.length > 0) {
      option.var = vars;
    }
  }

  return option;
}

// =============================================================================
// UCI Engine Class
// =============================================================================

export interface UCIEngineEvents {
  line: (line: string) => void;
  info: (info: ParsedInfo) => void;
  bestmove: (result: ParsedBestMove) => void;
  error: (error: Error) => void;
  exit: (code: number | null) => void;
}

/**
 * Low-level UCI engine process manager
 *
 * Handles:
 * - Spawning the engine process
 * - Line-buffered stdout parsing
 * - Sending commands
 * - Waiting for specific responses
 */
export class UCIEngine extends EventEmitter {
  private process: ChildProcess | null = null;
  private lineBuffer: string = '';
  private binaryPath: string;
  private isRunning: boolean = false;

  constructor(binaryPath: string) {
    super();
    this.binaryPath = binaryPath;
  }

  /**
   * Spawn the engine process
   */
  spawn(): void {
    if (this.isRunning) {
      throw new Error('Engine already running');
    }

    this.process = spawn(this.binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.isRunning = true;
    this.lineBuffer = '';

    // Handle stdout with line buffering
    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.lineBuffer += chunk.toString();
      const lines = this.lineBuffer.split('\n');
      // Keep incomplete line in buffer
      this.lineBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          this.handleLine(trimmed);
        }
      }
    });

    // Handle stderr
    this.process.stderr?.on('data', (chunk: Buffer) => {
      console.error('[Stockfish stderr]', chunk.toString());
    });

    // Handle exit
    this.process.on('exit', (code) => {
      this.isRunning = false;
      this.process = null;
      this.emit('exit', code);
    });

    // Handle errors
    this.process.on('error', (error) => {
      this.isRunning = false;
      this.emit('error', error);
    });
  }

  /**
   * Handle a line from stdout
   */
  private handleLine(line: string): void {
    this.emit('line', line);

    // Parse info lines
    if (line.startsWith('info ')) {
      const parsed = parseInfoLine(line);
      if (parsed) {
        this.emit('info', parsed);
      }
      return;
    }

    // Parse bestmove lines
    if (line.startsWith('bestmove ')) {
      const parsed = parseBestMove(line);
      if (parsed) {
        this.emit('bestmove', parsed);
      }
      return;
    }
  }

  /**
   * Send a command to the engine
   */
  send(command: string): void {
    if (!this.process?.stdin) {
      throw new Error('Engine not running');
    }
    this.process.stdin.write(command + '\n');
  }

  /**
   * Wait for a specific line from the engine
   */
  waitFor(predicate: string | ((line: string) => boolean), timeout: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removeListener('line', handler);
        reject(new Error(`Timeout waiting for: ${typeof predicate === 'string' ? predicate : 'predicate'}`));
      }, timeout);

      const handler = (line: string) => {
        const matches = typeof predicate === 'string' ? line === predicate : predicate(line);
        if (matches) {
          clearTimeout(timeoutId);
          this.removeListener('line', handler);
          resolve(line);
        }
      };

      this.on('line', handler);
    });
  }

  /**
   * Collect lines until a terminating line is received
   */
  collectUntil(
    terminator: string | ((line: string) => boolean),
    timeout: number = 10000
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const lines: string[] = [];

      const timeoutId = setTimeout(() => {
        this.removeListener('line', handler);
        reject(new Error(`Timeout collecting lines until: ${typeof terminator === 'string' ? terminator : 'predicate'}`));
      }, timeout);

      const handler = (line: string) => {
        const isTerminator = typeof terminator === 'string' ? line === terminator : terminator(line);
        if (isTerminator) {
          clearTimeout(timeoutId);
          this.removeListener('line', handler);
          lines.push(line);
          resolve(lines);
        } else {
          lines.push(line);
        }
      };

      this.on('line', handler);
    });
  }

  /**
   * Initialize UCI protocol
   */
  async initUCI(timeout: number = 10000): Promise<EngineInfo> {
    this.send('uci');

    const lines = await this.collectUntil('uciok', timeout);

    const info: EngineInfo = {
      name: 'Unknown Engine',
      authors: '',
      nnue: false,
      options: new Map(),
    };

    for (const line of lines) {
      if (line.startsWith('id name ')) {
        info.name = line.slice(8);
      } else if (line.startsWith('id author ')) {
        info.authors = line.slice(10);
      } else if (line.startsWith('option name ')) {
        const option = parseOptionLine(line);
        if (option) {
          info.options.set(option.name, option);

          // Check for NNUE
          if (option.name === 'EvalFile' || option.name.includes('NNUE')) {
            info.nnue = true;
          }
        }
      }
    }

    return info;
  }

  /**
   * Wait for engine to be ready
   */
  async isReady(timeout: number = 10000): Promise<void> {
    this.send('isready');
    await this.waitFor('readyok', timeout);
  }

  /**
   * Set a UCI option
   */
  async setOption(name: string, value: string | number | boolean): Promise<void> {
    const valueStr = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    this.send(`setoption name ${name} value ${valueStr}`);
    // Wait for engine to acknowledge
    await this.isReady();
  }

  /**
   * Start a new game (clears hash table)
   */
  async newGame(): Promise<void> {
    this.send('ucinewgame');
    await this.isReady();
  }

  /**
   * Set position from FEN
   */
  position(fen: string): void {
    this.send(`position fen ${fen}`);
  }

  /**
   * Set position from startpos with moves
   */
  positionMoves(moves: string[]): void {
    if (moves.length === 0) {
      this.send('position startpos');
    } else {
      this.send(`position startpos moves ${moves.join(' ')}`);
    }
  }

  /**
   * Build and send a 'go' command
   */
  go(options: {
    depth?: number;
    movetime?: number;
    nodes?: number;
    infinite?: boolean;
    searchmoves?: string[];
  }): void {
    let cmd = 'go';

    if (options.infinite) {
      cmd += ' infinite';
    }
    if (options.depth !== undefined) {
      cmd += ` depth ${options.depth}`;
    }
    if (options.movetime !== undefined) {
      cmd += ` movetime ${options.movetime}`;
    }
    if (options.nodes !== undefined) {
      cmd += ` nodes ${options.nodes}`;
    }
    if (options.searchmoves && options.searchmoves.length > 0) {
      cmd += ` searchmoves ${options.searchmoves.join(' ')}`;
    }

    this.send(cmd);
  }

  /**
   * Stop the current search
   */
  stop(): void {
    this.send('stop');
  }

  /**
   * Quit the engine
   */
  quit(): void {
    if (this.process) {
      this.send('quit');
      // Force kill after timeout
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 1000);
    }
  }

  /**
   * Check if engine is running
   */
  get running(): boolean {
    return this.isRunning;
  }
}


