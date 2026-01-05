import type { GameState, Move, PieceColor } from '@chess/shared';

export interface BoardPosition {
  fen: string;
  turn: PieceColor;
  moveNumber: number;
  lastMove: Move | null;
}

export class GameStateManager {
  private state: GameState;
  private subscribers: Set<(state: GameState) => void>;

  constructor(initialState?: Partial<GameState>) {
    this.state = {
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
      ...initialState,
    };
    this.subscribers = new Set();
  }

  getState(): GameState {
    return { ...this.state };
  }

  setState(newState: Partial<GameState>): void {
    this.state = { ...this.state, ...newState };
    this.notifySubscribers();
  }

  subscribe(callback: (state: GameState) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      callback(this.getState());
    }
  }
}

