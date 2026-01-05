import { describe, it, expect, beforeEach } from 'vitest';
import { createTools, executeToolCall } from '../src/agent/tools/index.js';
import { ChessManager } from '../src/chess/manager.js';
import { createMockSocket, MockSocket } from './mocks/socket.js';

describe('Agent Tools', () => {
  let gameManager: ChessManager;
  let mockSocket: MockSocket;

  beforeEach(() => {
    gameManager = new ChessManager();
    mockSocket = createMockSocket();
  });

  describe('createTools', () => {
    it('should return all required tools', () => {
      const tools = createTools();
      const toolNames = tools.map((t) => t.name);

      // Pure information tools
      expect(toolNames).toContain('get_position_stats');
      expect(toolNames).toContain('get_current_position');

      // Board primitive tools
      expect(toolNames).toContain('reset_board');
      expect(toolNames).toContain('make_move');
      expect(toolNames).toContain('make_moves');
      expect(toolNames).toContain('undo_moves');
      expect(toolNames).toContain('goto_move');
      expect(toolNames).toContain('set_position');

      // Annotation tools
      expect(toolNames).toContain('draw_arrows');
      expect(toolNames).toContain('highlight_squares');
      expect(toolNames).toContain('clear_annotations');

      // Analysis tools
      expect(toolNames).toContain('analyze_position');
    });

    it('should have proper parameter definitions for each tool', () => {
      const tools = createTools();

      for (const tool of tools) {
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe('object');
        expect(tool.description).toBeTruthy();
      }
    });
  });

  // =============================================================================
  // PURE INFORMATION TOOLS
  // =============================================================================

  describe('get_current_position', () => {
    it('should return starting position info', async () => {
      const result = await executeToolCall(
        'get_current_position',
        {},
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'White',
        moveNumber: 0,
        totalMoves: 0,
        moves: 'Starting position',
        isCheck: false,
        isCheckmate: false,
        isStalemate: false,
        isDraw: false,
      });
    });

    it('should return position after moves', async () => {
      gameManager.makeMove('e2', 'e4');
      gameManager.makeMove('e7', 'e5');

      const result = await executeToolCall(
        'get_current_position',
        {},
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        turn: 'White',
        moveNumber: 2,
        totalMoves: 2,
        isCheck: false,
      });
      expect((result as any).moves).toContain('e4');
      expect((result as any).moves).toContain('e5');
    });
  });

  // =============================================================================
  // BOARD PRIMITIVE TOOLS
  // =============================================================================

  describe('reset_board', () => {
    it('should reset board to starting position', async () => {
      // Make some moves first
      gameManager.makeMove('e2', 'e4');
      gameManager.makeMove('e7', 'e5');

      const result = await executeToolCall(
        'reset_board',
        {},
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        message: 'Board reset to starting position',
      });
      expect(gameManager.getState().currentMoveIndex).toBe(0);
      expect(gameManager.getFEN()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      expect(mockSocket.emit).toHaveBeenCalledWith('game:state', expect.any(Object));
    });
  });

  describe('make_move', () => {
    it('should make a valid move in UCI format', async () => {
      const result = await executeToolCall(
        'make_move',
        { move: 'e2e4' },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        move: 'e4',
        turn: 'Black',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('game:state', expect.any(Object));
    });

    it('should make a valid move in SAN format', async () => {
      const result = await executeToolCall(
        'make_move',
        { move: 'e4' },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        move: 'e4',
      });
    });

    it('should reject invalid moves', async () => {
      const result = await executeToolCall(
        'make_move',
        { move: 'e2e5' },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        error: expect.stringContaining('Invalid move'),
      });
    });

    it('should handle promotion', async () => {
      // Set up a position with a pawn about to promote
      gameManager.loadFEN('8/P7/8/8/8/8/8/4K2k w - - 0 1');

      const result = await executeToolCall(
        'make_move',
        { move: 'a7a8q' },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
      });
    });
  });

  describe('make_moves', () => {
    it('should make multiple moves instantly when animate=false', async () => {
      const result = await executeToolCall(
        'make_moves',
        { moves: ['e4', 'e5', 'Nf3', 'Nc6'], animate: false },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        animated: false,
        movesPlayed: ['e4', 'e5', 'Nf3', 'Nc6'],
        totalMoves: 4,
      });
      expect(gameManager.getState().history.length).toBe(4);
    });

    it('should emit animation events when animated', async () => {
      const result = await executeToolCall(
        'make_moves',
        { moves: ['e4', 'e5'], animate: true, delayMs: 500 },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        animated: true,
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('animation:start', expect.any(Object));
      expect(mockSocket.emit).toHaveBeenCalledWith('animation:complete', expect.any(Object));
    });

    it('should stop on invalid move', async () => {
      const result = await executeToolCall(
        'make_moves',
        { moves: ['e4', 'e5', 'invalidmove', 'Nc6'], animate: false },
        gameManager,
        mockSocket as any
      );

      expect((result as any).movesPlayed.length).toBe(2); // Only e4, e5 should succeed
    });
  });

  describe('undo_moves', () => {
    beforeEach(() => {
      gameManager.makeMove('e2', 'e4');
      gameManager.makeMove('e7', 'e5');
      gameManager.makeMove('g1', 'f3');
    });

    it('should undo one move by default', async () => {
      const result = await executeToolCall(
        'undo_moves',
        {},
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        previousMoveIndex: 3,
        currentMoveIndex: 2,
      });
      expect(gameManager.getState().currentMoveIndex).toBe(2);
    });

    it('should undo multiple moves', async () => {
      const result = await executeToolCall(
        'undo_moves',
        { count: 2 },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        previousMoveIndex: 3,
        currentMoveIndex: 1,
      });
      expect(gameManager.getState().currentMoveIndex).toBe(1);
    });

    it('should not go below zero', async () => {
      const result = await executeToolCall(
        'undo_moves',
        { count: 100 },
        gameManager,
        mockSocket as any
      );

      expect((result as any).currentMoveIndex).toBe(0);
    });
  });

  describe('goto_move', () => {
    beforeEach(() => {
      gameManager.makeMove('e2', 'e4');
      gameManager.makeMove('e7', 'e5');
      gameManager.makeMove('g1', 'f3');
    });

    it('should navigate to beginning', async () => {
      const result = await executeToolCall(
        'goto_move',
        { moveIndex: 0 },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        moveIndex: 0,
      });
      expect(gameManager.getState().currentMoveIndex).toBe(0);
    });

    it('should navigate to specific move', async () => {
      const result = await executeToolCall(
        'goto_move',
        { moveIndex: 2 },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        moveIndex: 2,
      });
      expect(gameManager.getState().currentMoveIndex).toBe(2);
    });

    it('should reject invalid index', async () => {
      const result = await executeToolCall(
        'goto_move',
        { moveIndex: 100 },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        error: expect.stringContaining('Invalid move index'),
      });
    });
  });

  describe('set_position', () => {
    it('should set position from FEN', async () => {
      const customFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
      
      const result = await executeToolCall(
        'set_position',
        { fen: customFen },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        fen: customFen,
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('game:state', expect.any(Object));
    });

    it('should reject invalid FEN', async () => {
      const result = await executeToolCall(
        'set_position',
        { fen: 'not a valid fen' },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        error: expect.stringContaining('Invalid FEN'),
      });
    });
  });

  // =============================================================================
  // ANNOTATION TOOLS
  // =============================================================================

  describe('draw_arrows', () => {
    it('should emit arrow annotations', async () => {
      const arrows = [
        { from: 'e2', to: 'e4', color: 'green' },
        { from: 'd2', to: 'd4', color: 'blue' },
      ];

      const result = await executeToolCall(
        'draw_arrows',
        { arrows },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        message: 'Drew 2 arrow(s) on the board',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('board:clearAnnotations');
      expect(mockSocket.emit).toHaveBeenCalledWith('board:annotations', {
        arrows: expect.arrayContaining([
          expect.objectContaining({ from: 'e2', to: 'e4', color: 'green' }),
          expect.objectContaining({ from: 'd2', to: 'd4', color: 'blue' }),
        ]),
        highlights: [],
      });
    });

    it('should use default color when not specified', async () => {
      const arrows = [{ from: 'e2', to: 'e4' }];

      const result = await executeToolCall(
        'draw_arrows',
        { arrows },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
      });

      const annotationsCall = mockSocket.emittedEvents.find(
        (e) => e.event === 'board:annotations'
      );
      expect(annotationsCall?.args[0]).toMatchObject({
        arrows: [{ from: 'e2', to: 'e4', color: 'green' }],
      });
    });

    it('should not clear existing when clearExisting is false', async () => {
      const arrows = [{ from: 'e2', to: 'e4' }];

      await executeToolCall(
        'draw_arrows',
        { arrows, clearExisting: false },
        gameManager,
        mockSocket as any
      );

      expect(mockSocket.emit).not.toHaveBeenCalledWith('board:clearAnnotations');
    });
  });

  describe('highlight_squares', () => {
    it('should emit square highlights', async () => {
      const highlights = [
        { square: 'e4', color: 'green', type: 'key' },
        { square: 'd5', color: 'red', type: 'weak' },
      ];

      const result = await executeToolCall(
        'highlight_squares',
        { highlights },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        message: 'Highlighted 2 square(s)',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('board:annotations', {
        arrows: [],
        highlights: expect.arrayContaining([
          expect.objectContaining({ square: 'e4', color: 'green', type: 'key' }),
          expect.objectContaining({ square: 'd5', color: 'red', type: 'weak' }),
        ]),
      });
    });

    it('should use default values when not specified', async () => {
      const highlights = [{ square: 'e4' }];

      await executeToolCall(
        'highlight_squares',
        { highlights },
        gameManager,
        mockSocket as any
      );

      const annotationsCall = mockSocket.emittedEvents.find(
        (e) => e.event === 'board:annotations'
      );
      expect(annotationsCall?.args[0]).toMatchObject({
        highlights: [{ square: 'e4', color: 'yellow', type: 'key' }],
      });
    });
  });

  describe('clear_annotations', () => {
    it('should emit clear annotations event', async () => {
      const result = await executeToolCall(
        'clear_annotations',
        {},
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        success: true,
        message: 'Cleared all annotations from the board',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('board:clearAnnotations');
    });
  });
});

describe('Board Manipulation - Coach Workflow', () => {
  describe('Opening demonstration', () => {
    let gameManager: ChessManager;
    let mockSocket: MockSocket;

    beforeEach(() => {
      gameManager = new ChessManager();
      mockSocket = createMockSocket();
    });

    it('should demonstrate opening using make_moves', async () => {
      // Reset board (like a coach would)
      await executeToolCall('reset_board', {}, gameManager, mockSocket as any);

      // Play through the Italian Game moves
      const result = await executeToolCall(
        'make_moves',
        { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], animate: false },
        gameManager,
        mockSocket as any
      );

      expect((result as any).movesPlayed).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
      expect(gameManager.getState().history.length).toBe(5);
    });

    it('should show variations by rewinding and playing different moves', async () => {
      // Setup: Play first 3 moves
      await executeToolCall(
        'make_moves',
        { moves: ['e4', 'e5', 'Nf3'], animate: false },
        gameManager,
        mockSocket as any
      );

      expect(gameManager.getState().currentMoveIndex).toBe(3);

      // Show Ruy Lopez continuation (Nc6 then Bb5)
      const result = await executeToolCall(
        'make_moves',
        { moves: ['Nc6', 'Bb5'], animate: false },
        gameManager,
        mockSocket as any
      );

      expect((result as any).success).toBe(true);
      const moves = gameManager.getState().history.map((m) => m.san);
      expect(moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);

      // Now rewind to show Italian Game variation instead
      await executeToolCall(
        'undo_moves',
        { count: 1 },
        gameManager,
        mockSocket as any
      );

      // Play Bc4 for Italian Game
      const italianResult = await executeToolCall(
        'make_moves',
        { moves: ['Bc4'], animate: false },
        gameManager,
        mockSocket as any
      );

      expect((italianResult as any).success).toBe(true);
      // After undo and new move, history is overwritten
      const finalMoves = gameManager.getState().history.map((m) => m.san);
      expect(finalMoves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    });
  });

  describe('Caro-Kann demonstration', () => {
    let gameManager: ChessManager;
    let mockSocket: MockSocket;

    beforeEach(() => {
      gameManager = new ChessManager();
      mockSocket = createMockSocket();
    });

    it('should demonstrate main line then show advance variation', async () => {
      // Play main Caro-Kann setup
      await executeToolCall(
        'make_moves',
        { moves: ['e4', 'c6', 'd4', 'd5'], animate: false },
        gameManager,
        mockSocket as any
      );

      // Now show Advance Variation
      const result = await executeToolCall(
        'make_moves',
        { moves: ['e5'], animate: false },
        gameManager,
        mockSocket as any
      );

      expect((result as any).success).toBe(true);
      const moves = gameManager.getState().history.map((m) => m.san);
      expect(moves).toEqual(['e4', 'c6', 'd4', 'd5', 'e5']);
    });
  });
});
