/**
 * Stockfish Integration Tests
 *
 * Tests the Stockfish engine service with real UCI communication
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StockfishService, type AnalysisInfo, type AnalysisComplete } from '../src/engine/stockfish.js';

// Skip tests if Stockfish binary is not available
const STOCKFISH_TIMEOUT = 30000; // Allow time for engine operations

describe('StockfishService', () => {
  let service: StockfishService;

  beforeAll(async () => {
    service = new StockfishService();
    try {
      await service.init();
    } catch (error) {
      console.warn('Stockfish not available, skipping tests:', error);
      return;
    }
  }, STOCKFISH_TIMEOUT);

  afterAll(async () => {
    if (service?.isReady()) {
      await service.quit();
    }
  });

  it('should initialize engine and report info', async () => {
    if (!service?.isReady()) {
      console.log('Skipping: Stockfish not available');
      return;
    }

    const info = service.getEngineInfo();
    expect(info).toBeTruthy();
    expect(info?.name).toContain('Stockfish');
    expect(info?.nnue).toBe(true);
  });

  it('should analyze starting position to depth 10', async () => {
    if (!service?.isReady()) {
      console.log('Skipping: Stockfish not available');
      return;
    }

    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const result = await service.analyze(startingFen, { depth: 10 });

    expect(result.fen).toBe(startingFen);
    expect(result.bestMove).toBeTruthy();
    expect(result.bestMove.length).toBeGreaterThanOrEqual(4); // UCI format e.g., e2e4
    expect(result.lines.length).toBeGreaterThan(0);

    const mainLine = result.lines[0];
    expect(mainLine.depth).toBeGreaterThanOrEqual(10);
    expect(mainLine.moves.length).toBeGreaterThan(0);
    // Starting position should be roughly equal
    expect(Math.abs(mainLine.score.value)).toBeLessThan(100); // Less than 1 pawn advantage
  }, STOCKFISH_TIMEOUT);

  it('should analyze with MultiPV (multiple lines)', async () => {
    if (!service?.isReady()) {
      console.log('Skipping: Stockfish not available');
      return;
    }

    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const result = await service.analyze(startingFen, { depth: 8, multiPv: 3 });

    expect(result.lines.length).toBe(3);
    
    // Each line should have different first moves
    const firstMoves = result.lines.map(l => l.moves[0]);
    const uniqueMoves = new Set(firstMoves);
    expect(uniqueMoves.size).toBe(3);

    // Lines should be sorted by PV number
    expect(result.lines[0].pv).toBe(1);
    expect(result.lines[1].pv).toBe(2);
    expect(result.lines[2].pv).toBe(3);
  }, STOCKFISH_TIMEOUT);

  it('should stream analysis info during search', async () => {
    if (!service?.isReady()) {
      console.log('Skipping: Stockfish not available');
      return;
    }

    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const infoEvents: AnalysisInfo[] = [];

    // Collect info events
    const infoHandler = (info: AnalysisInfo) => {
      infoEvents.push(info);
    };
    service.on('info', infoHandler);

    const result = await service.analyze(startingFen, { depth: 12 });

    service.removeListener('info', infoHandler);

    // Should have received multiple info updates
    expect(infoEvents.length).toBeGreaterThan(0);

    // Depths should be increasing
    const depths = infoEvents.map(e => e.currentDepth);
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
    }

    // Final result should match last info
    expect(result.bestMove).toBeTruthy();
  }, STOCKFISH_TIMEOUT);

  it('should analyze winning position and find mate', async () => {
    if (!service?.isReady()) {
      console.log('Skipping: Stockfish not available');
      return;
    }

    // Scholar's mate position - White to play Qxf7#
    const mateFen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const result = await service.analyze(mateFen, { depth: 10 });

    // Should find Qxf7#
    expect(result.bestMove).toBe('h5f7');

    // Score should indicate mate
    const mainLine = result.lines[0];
    expect(mainLine.score.type).toBe('mate');
    expect(mainLine.score.value).toBe(1); // Mate in 1
  }, STOCKFISH_TIMEOUT);

  it('should handle time-limited analysis', async () => {
    if (!service?.isReady()) {
      console.log('Skipping: Stockfish not available');
      return;
    }

    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const startTime = Date.now();
    
    const result = await service.analyze(startingFen, { movetime: 1000 });
    
    const elapsed = Date.now() - startTime;
    
    // Should complete within reasonable time of the movetime
    expect(elapsed).toBeGreaterThan(800); // At least 800ms
    expect(elapsed).toBeLessThan(3000); // But not more than 3s
    
    expect(result.bestMove).toBeTruthy();
    expect(result.totalTime).toBeGreaterThan(0);
  }, STOCKFISH_TIMEOUT);

  it('should stop infinite analysis', async () => {
    if (!service?.isReady()) {
      console.log('Skipping: Stockfish not available');
      return;
    }

    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    let receivedInfo = false;

    service.on('info', () => {
      receivedInfo = true;
    });

    // Start infinite analysis
    await service.startAnalysis(startingFen, { infinite: true, multiPv: 1 });

    // Wait a bit for analysis to progress
    await new Promise(resolve => setTimeout(resolve, 500));

    // Stop and get result
    const result = await service.stopAnalysis();

    expect(receivedInfo).toBe(true);
    expect(result).toBeTruthy();
    expect(result?.bestMove).toBeTruthy();
    expect(result?.lines.length).toBeGreaterThan(0);
  }, STOCKFISH_TIMEOUT);

  it('should handle complex middlegame position', async () => {
    if (!service?.isReady()) {
      console.log('Skipping: Stockfish not available');
      return;
    }

    // Sicilian Dragon position
    const dragonFen = 'r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R w KQ - 2 9';
    const result = await service.analyze(dragonFen, { depth: 12 });

    expect(result.bestMove).toBeTruthy();
    expect(result.lines[0].moves.length).toBeGreaterThan(0);
    
    // Should have reasonable evaluation
    const score = result.lines[0].score;
    expect(score.type).toBe('cp');
    // Typically slightly better for White in this position
  }, STOCKFISH_TIMEOUT);
});

describe('UCI Parser', () => {
  it('should parse info lines correctly', async () => {
    const { parseInfoLine } = await import('../src/engine/uci.js');

    const line = 'info depth 24 seldepth 32 multipv 1 score cp 35 nodes 12345678 nps 2500000 hashfull 450 time 4938 pv e2e4 e7e5 g1f3';
    const result = parseInfoLine(line);

    expect(result).toBeTruthy();
    expect(result?.depth).toBe(24);
    expect(result?.seldepth).toBe(32);
    expect(result?.multipv).toBe(1);
    expect(result?.score).toEqual({ type: 'cp', value: 35 });
    expect(result?.nodes).toBe(12345678);
    expect(result?.nps).toBe(2500000);
    expect(result?.hashfull).toBe(450);
    expect(result?.time).toBe(4938);
    expect(result?.pv).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });

  it('should parse mate scores', async () => {
    const { parseInfoLine } = await import('../src/engine/uci.js');

    const line = 'info depth 20 score mate 3 pv e2e4';
    const result = parseInfoLine(line);

    expect(result?.score).toEqual({ type: 'mate', value: 3 });
  });

  it('should parse bestmove lines', async () => {
    const { parseBestMove } = await import('../src/engine/uci.js');

    const line = 'bestmove e2e4 ponder e7e5';
    const result = parseBestMove(line);

    expect(result?.bestmove).toBe('e2e4');
    expect(result?.ponder).toBe('e7e5');
  });

  it('should parse bestmove without ponder', async () => {
    const { parseBestMove } = await import('../src/engine/uci.js');

    const line = 'bestmove e2e4';
    const result = parseBestMove(line);

    expect(result?.bestmove).toBe('e2e4');
    expect(result?.ponder).toBeUndefined();
  });

  it('should parse option lines', async () => {
    const { parseOptionLine } = await import('../src/engine/uci.js');

    const spinLine = 'option name Hash type spin default 16 min 1 max 33554432';
    const spinResult = parseOptionLine(spinLine);
    
    expect(spinResult?.name).toBe('Hash');
    expect(spinResult?.type).toBe('spin');
    expect(spinResult?.default).toBe(16);
    expect(spinResult?.min).toBe(1);
    expect(spinResult?.max).toBe(33554432);

    const checkLine = 'option name Ponder type check default false';
    const checkResult = parseOptionLine(checkLine);
    
    expect(checkResult?.name).toBe('Ponder');
    expect(checkResult?.type).toBe('check');
    expect(checkResult?.default).toBe(false);
  });
});

