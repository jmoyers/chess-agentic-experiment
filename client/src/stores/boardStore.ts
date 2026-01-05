import { create } from 'zustand';
import { Chess, Square, Move as ChessMove } from 'chess.js';
import type { GameState, Move, Piece, PieceColor, PieceType, BoardArrow, SquareHighlight, BoardAnnotations, ArrowColor, HighlightColor } from '@chess/shared';
import sounds from '../utils/sounds';

interface VirtualState {
  isActive: boolean;
  baseFen: string;
  baseIndex: number;
  virtualMoves: Move[];
  currentVirtualIndex: number;
}

interface AnimationState {
  isAnimating: boolean;
  currentMoveIndex: number;
  totalMoves: number;
  description?: string;
}

interface BoardState {
  // Game state
  fen: string;
  pgn: string;
  history: Move[];
  currentMoveIndex: number;
  turn: PieceColor;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isGameOver: boolean;
  
  // UI state
  selectedSquare: string | null;
  legalMoves: string[];
  lastMove: { from: string; to: string } | null;
  error: string | null;
  
  // Annotations (from agent)
  arrows: BoardArrow[];
  highlights: SquareHighlight[];
  
  // User annotations (drawn by user, persist separately)
  userArrows: BoardArrow[];
  userHighlights: SquareHighlight[];
  
  // Virtual/Analysis mode
  virtualState: VirtualState;
  
  // Animation state
  animationState: AnimationState;
  
  // Local chess instance for validation
  chess: Chess;
  
  // Actions
  setGameState: (state: GameState) => void;
  selectSquare: (square: string | null) => void;
  getLegalMovesForSquare: (square: string) => string[];
  getPieceAt: (square: string) => Piece | null;
  isLegalMove: (from: string, to: string) => boolean;
  navigateToMove: (index: number) => void;
  setError: (error: string | null) => void;
  
  // Annotations (from agent)
  setAnnotations: (annotations: BoardAnnotations) => void;
  addArrows: (arrows: BoardArrow[]) => void;
  addHighlights: (highlights: SquareHighlight[]) => void;
  clearAnnotations: () => void;
  
  // User annotations
  toggleUserArrow: (from: string, to: string, color?: ArrowColor) => void;
  toggleUserHighlight: (square: string, color?: HighlightColor) => void;
  clearUserAnnotations: () => void;
  
  // Virtual mode
  startVirtualMode: (baseFen: string, baseIndex: number) => void;
  setVirtualMoves: (moves: Move[], annotations?: BoardAnnotations) => void;
  navigateVirtual: (index: number) => void;
  exitVirtualMode: () => void;
  
  // Animation
  startAnimation: (description?: string, totalMoves?: number) => void;
  updateAnimation: (moveIndex: number, totalMoves: number) => void;
  endAnimation: () => void;
  
  // For local preview before server confirmation
  previewMove: (from: string, to: string) => boolean;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn: '',
  history: [],
  currentMoveIndex: 0,
  turn: 'w',
  isCheck: false,
  isCheckmate: false,
  isStalemate: false,
  isDraw: false,
  isGameOver: false,
  
  selectedSquare: null,
  legalMoves: [],
  lastMove: null,
  error: null,
  
  arrows: [],
  highlights: [],
  
  userArrows: [],
  userHighlights: [],
  
  virtualState: {
    isActive: false,
    baseFen: '',
    baseIndex: 0,
    virtualMoves: [],
    currentVirtualIndex: 0,
  },
  
  animationState: {
    isAnimating: false,
    currentMoveIndex: 0,
    totalMoves: 0,
    description: undefined,
  },
  
  chess: new Chess(),
  
  setGameState: (state) => {
    const chess = new Chess();
    chess.load(state.fen);
    
    const prevState = get();
    
    // Determine last move from history
    let lastMove = null;
    let lastMoveData: Move | null = null;
    if (state.currentMoveIndex > 0 && state.history.length > 0) {
      const move = state.history[state.currentMoveIndex - 1];
      if (move) {
        lastMove = { from: move.from, to: move.to };
        lastMoveData = move;
      }
    }
    
    // Play appropriate sound based on what happened
    const isNewMove = state.currentMoveIndex !== prevState.currentMoveIndex;
    const isForwardMove = state.currentMoveIndex > prevState.currentMoveIndex;
    
    if (isNewMove && isForwardMove && lastMoveData) {
      // Determine sound to play based on move type
      if (state.isCheckmate) {
        sounds.gameOver();
      } else if (state.isCheck) {
        sounds.check();
      } else if (lastMoveData.san?.includes('O-O')) {
        // Castling
        sounds.castle();
      } else if (lastMoveData.san?.includes('=')) {
        // Promotion
        sounds.promotion();
      } else if (lastMoveData.captured) {
        sounds.capture();
      } else {
        sounds.move();
      }
    } else if (isNewMove && !isForwardMove) {
      // Navigation backwards - subtle move sound
      sounds.move();
    }
    
    // Exit virtual mode when real state changes
    const { virtualState } = prevState;
    
    // Only clear annotations when a NEW move is made (history length changes)
    // This happens when either the user or agent makes an actual move
    // Don't clear on navigation (ArrowLeft/ArrowRight) - arrows should persist during demos
    const isActualNewMove = state.history.length !== prevState.history.length;
    
    set({
      fen: state.fen,
      pgn: state.pgn,
      history: state.history,
      currentMoveIndex: state.currentMoveIndex,
      turn: state.turn,
      isCheck: state.isCheck,
      isCheckmate: state.isCheckmate,
      isStalemate: state.isStalemate,
      isDraw: state.isDraw,
      isGameOver: state.isGameOver,
      chess,
      lastMove,
      selectedSquare: null,
      legalMoves: [],
      error: null,
      virtualState: virtualState.isActive ? { ...virtualState, isActive: false } : virtualState,
      // Clear annotations when a new move is made (by user or agent)
      // Keep them during navigation so agent demos work properly
      arrows: isActualNewMove ? [] : prevState.arrows,
      highlights: isActualNewMove ? [] : prevState.highlights,
      userArrows: isActualNewMove ? [] : prevState.userArrows,
      userHighlights: isActualNewMove ? [] : prevState.userHighlights,
    });
  },
  
  selectSquare: (square) => {
    if (!square) {
      set({ selectedSquare: null, legalMoves: [] });
      return;
    }
    
    const { chess } = get();
    const moves = chess.moves({ square: square as Square, verbose: true });
    const legalMoves = moves.map((m: ChessMove) => m.to);
    
    set({ selectedSquare: square, legalMoves });
  },
  
  getLegalMovesForSquare: (square) => {
    const { chess } = get();
    const moves = chess.moves({ square: square as Square, verbose: true });
    return moves.map((m: ChessMove) => m.to);
  },
  
  getPieceAt: (square) => {
    const { chess } = get();
    const piece = chess.get(square as Square);
    if (!piece) return null;
    return {
      type: piece.type as PieceType,
      color: piece.color as PieceColor,
    };
  },
  
  isLegalMove: (from, to) => {
    const { chess } = get();
    const moves = chess.moves({ square: from as Square, verbose: true });
    return moves.some((m: ChessMove) => m.to === to);
  },
  
  navigateToMove: (index) => {
    // This will be handled by the connection store which emits to the server
    // The server will send back the new state
    const { history } = get();
    if (index < 0 || index > history.length) return;
    
    // Import dynamically to avoid circular dependency
    import('./connectionStore').then(({ useConnectionStore }) => {
      useConnectionStore.getState().navigateToMove(index);
    });
  },
  
  setError: (error) => {
    set({ error });
    // Play error sound and clear error after 3 seconds
    if (error) {
      sounds.illegal();
      setTimeout(() => set({ error: null }), 3000);
    }
  },
  
  previewMove: (from, to) => {
    const { chess } = get();
    try {
      const move = chess.move({ from: from as Square, to: to as Square });
      if (move) {
        // Revert the move - we just wanted to check validity
        chess.undo();
        return true;
      }
    } catch {
      return false;
    }
    return false;
  },
  
  // Annotation methods
  setAnnotations: (annotations) => {
    set({
      arrows: annotations.arrows,
      highlights: annotations.highlights,
    });
  },
  
  addArrows: (newArrows) => {
    set((state) => ({
      arrows: [...state.arrows, ...newArrows],
    }));
  },
  
  addHighlights: (newHighlights) => {
    set((state) => ({
      highlights: [...state.highlights, ...newHighlights],
    }));
  },
  
  clearAnnotations: () => {
    set({ arrows: [], highlights: [] });
  },
  
  // User annotation methods (toggle behavior)
  toggleUserArrow: (from, to, color = 'green') => {
    set((state) => {
      const existingIndex = state.userArrows.findIndex(
        (a) => a.from === from && a.to === to
      );
      
      if (existingIndex >= 0) {
        // Arrow exists - remove it (toggle off)
        const newArrows = [...state.userArrows];
        newArrows.splice(existingIndex, 1);
        return { userArrows: newArrows };
      } else {
        // Arrow doesn't exist - add it
        return {
          userArrows: [...state.userArrows, { from, to, color }],
        };
      }
    });
  },
  
  toggleUserHighlight: (square, color = 'green') => {
    set((state) => {
      const existingIndex = state.userHighlights.findIndex(
        (h) => h.square === square
      );
      
      if (existingIndex >= 0) {
        // Highlight exists - remove it (toggle off)
        const newHighlights = [...state.userHighlights];
        newHighlights.splice(existingIndex, 1);
        return { userHighlights: newHighlights };
      } else {
        // Highlight doesn't exist - add it
        return {
          userHighlights: [...state.userHighlights, { square, color, type: 'custom' as const }],
        };
      }
    });
  },
  
  clearUserAnnotations: () => {
    set({ userArrows: [], userHighlights: [] });
  },
  
  // Virtual mode methods
  startVirtualMode: (baseFen, baseIndex) => {
    set({
      virtualState: {
        isActive: true,
        baseFen,
        baseIndex,
        virtualMoves: [],
        currentVirtualIndex: 0,
      },
    });
  },
  
  setVirtualMoves: (moves, annotations) => {
    const { virtualState, fen: currentFen } = get();
    
    // Build virtual positions by applying moves
    const chess = new Chess(virtualState.baseFen || currentFen);
    const validMoves: Move[] = [];
    
    for (const move of moves) {
      try {
        const result = chess.move(move.san || { from: move.from, to: move.to });
        if (result) {
          validMoves.push({
            from: result.from,
            to: result.to,
            san: result.san,
            piece: result.piece as PieceType,
            captured: result.captured as PieceType | undefined,
          });
        }
      } catch {
        // Stop if invalid move
        break;
      }
    }
    
    set({
      virtualState: {
        ...virtualState,
        isActive: true,
        virtualMoves: validMoves,
        currentVirtualIndex: validMoves.length,
      },
      fen: chess.fen(),
      chess,
      arrows: annotations?.arrows || [],
      highlights: annotations?.highlights || [],
    });
  },
  
  navigateVirtual: (index) => {
    const { virtualState } = get();
    if (!virtualState.isActive) return;
    
    const clampedIndex = Math.max(0, Math.min(index, virtualState.virtualMoves.length));
    
    // Rebuild position from base
    const chess = new Chess(virtualState.baseFen);
    
    for (let i = 0; i < clampedIndex; i++) {
      const move = virtualState.virtualMoves[i];
      chess.move(move.san || { from: move.from, to: move.to });
    }
    
    set({
      virtualState: {
        ...virtualState,
        currentVirtualIndex: clampedIndex,
      },
      fen: chess.fen(),
      chess,
    });
  },
  
  exitVirtualMode: () => {
    const { virtualState } = get();
    if (!virtualState.isActive) return;
    
    // Restore base position
    const chess = new Chess(virtualState.baseFen);
    
    set({
      virtualState: {
        isActive: false,
        baseFen: '',
        baseIndex: 0,
        virtualMoves: [],
        currentVirtualIndex: 0,
      },
      fen: virtualState.baseFen,
      chess,
      arrows: [],
      highlights: [],
    });
    
    // Trigger navigation back to original position
    import('./connectionStore').then(({ useConnectionStore }) => {
      useConnectionStore.getState().navigateToMove(virtualState.baseIndex);
    });
  },
  
  // Animation methods
  startAnimation: (description, totalMoves = 0) => {
    set({
      animationState: {
        isAnimating: true,
        currentMoveIndex: 0,
        totalMoves,
        description,
      },
    });
  },
  
  updateAnimation: (moveIndex, totalMoves) => {
    set({
      animationState: {
        ...get().animationState,
        currentMoveIndex: moveIndex,
        totalMoves,
      },
    });
  },
  
  endAnimation: () => {
    set({
      animationState: {
        isAnimating: false,
        currentMoveIndex: 0,
        totalMoves: 0,
        description: undefined,
      },
    });
  },
}));

// Expose store to window for E2E testing
if (typeof window !== 'undefined') {
  (window as unknown as { __BOARD_STORE__: typeof useBoardStore }).__BOARD_STORE__ = useBoardStore;
}

