import { Chess, Move as ChessMove, Square } from 'chess.js';
import type { GameState, Move, PieceType, PieceColor } from '@chess/shared';

// Tactical analysis types
export interface SquareTacticalInfo {
  square: string;
  piece?: { type: string; color: 'w' | 'b' };
  attackedBy: { white: string[]; black: string[] };
  defendedBy: string[];
  isHanging: boolean;
  netControl: number; // positive = white controls, negative = black controls
}

export interface TacticalAnalysis {
  hangingPieces: Array<{ square: string; piece: string; color: 'w' | 'b'; attackers: number; defenders: number }>;
  attackedPieces: Array<{ square: string; piece: string; color: 'w' | 'b'; attackers: number; defenders: number }>;
  undefendedPieces: Array<{ square: string; piece: string; color: 'w' | 'b' }>;
  keySquares: Array<{ square: string; whiteAttackers: number; blackAttackers: number; piece?: string }>;
  threats: string[];
  summary: string;
}

export class ChessManager {
  private chess: Chess;
  private moveHistory: Move[];
  private positionHistory: string[];
  private currentIndex: number;

  constructor() {
    this.chess = new Chess();
    this.moveHistory = [];
    this.positionHistory = [this.chess.fen()];
    this.currentIndex = 0;
  }

  loadFEN(fen: string): void {
    this.chess.load(fen);
    this.moveHistory = [];
    this.positionHistory = [fen];
    this.currentIndex = 0;
  }

  loadPGN(pgn: string): void {
    this.chess.loadPgn(pgn);
    
    // Get the move history from the loaded PGN
    const history = this.chess.history({ verbose: true });
    
    // Rebuild position history
    this.chess.reset();
    this.positionHistory = [this.chess.fen()];
    this.moveHistory = [];

    for (const move of history) {
      this.chess.move(move.san);
      this.moveHistory.push(this.convertMove(move));
      this.positionHistory.push(this.chess.fen());
    }

    this.currentIndex = this.moveHistory.length;
  }

  makeMove(from: string, to: string, promotion?: PieceType): Move | null {
    // If we're not at the end of history, truncate
    if (this.currentIndex < this.moveHistory.length) {
      this.moveHistory = this.moveHistory.slice(0, this.currentIndex);
      this.positionHistory = this.positionHistory.slice(0, this.currentIndex + 1);
      // Reload position at current index
      this.chess.load(this.positionHistory[this.currentIndex]);
    }

    try {
      const result = this.chess.move({
        from,
        to,
        promotion: promotion || undefined,
      });

      if (result) {
        const move = this.convertMove(result);
        this.moveHistory.push(move);
        this.positionHistory.push(this.chess.fen());
        this.currentIndex = this.moveHistory.length;
        return move;
      }
    } catch {
      return null;
    }

    return null;
  }

  navigateToMove(index: number): void {
    if (index < 0 || index > this.moveHistory.length) {
      throw new Error('Invalid move index');
    }

    this.currentIndex = index;
    this.chess.load(this.positionHistory[index]);
  }

  reset(): void {
    this.chess.reset();
    this.moveHistory = [];
    this.positionHistory = [this.chess.fen()];
    this.currentIndex = 0;
  }

  getState(): GameState {
    return {
      fen: this.chess.fen(),
      pgn: this.chess.pgn(),
      history: this.moveHistory,
      currentMoveIndex: this.currentIndex,
      turn: this.chess.turn() as PieceColor,
      isCheck: this.chess.isCheck(),
      isCheckmate: this.chess.isCheckmate(),
      isStalemate: this.chess.isStalemate(),
      isDraw: this.chess.isDraw(),
      isGameOver: this.chess.isGameOver(),
    };
  }

  getLegalMoves(square?: string): Move[] {
    const moves = square 
      ? this.chess.moves({ square: square as any, verbose: true })
      : this.chess.moves({ verbose: true });
    
    return moves.map(this.convertMove);
  }

  getFEN(): string {
    return this.chess.fen();
  }

  getPGN(): string {
    return this.chess.pgn();
  }

  getTurn(): PieceColor {
    return this.chess.turn() as PieceColor;
  }

  getPositionAtIndex(index: number): string {
    if (index < 0 || index >= this.positionHistory.length) {
      throw new Error('Invalid position index');
    }
    return this.positionHistory[index];
  }

  getMoveAtIndex(index: number): Move | null {
    if (index < 0 || index >= this.moveHistory.length) {
      return null;
    }
    return this.moveHistory[index];
  }

  getFullHistory(): { moves: Move[]; positions: string[] } {
    return {
      moves: [...this.moveHistory],
      positions: [...this.positionHistory],
    };
  }

  private convertMove(move: ChessMove): Move {
    return {
      from: move.from,
      to: move.to,
      promotion: move.promotion as PieceType | undefined,
      san: move.san,
      piece: move.piece as PieceType,
      captured: move.captured as PieceType | undefined,
      flags: move.flags,
    };
  }

  /**
   * Compute tactical analysis for the current position.
   * Identifies hanging pieces, attacked pieces, defenders, and key contested squares.
   */
  getTacticalAnalysis(): TacticalAnalysis {
    const board = this.chess.board();
    const allSquares = this.getAllSquares();
    
    // Track pieces and their attackers/defenders
    const hangingPieces: TacticalAnalysis['hangingPieces'] = [];
    const attackedPieces: TacticalAnalysis['attackedPieces'] = [];
    const undefendedPieces: TacticalAnalysis['undefendedPieces'] = [];
    const keySquares: TacticalAnalysis['keySquares'] = [];
    const threats: string[] = [];
    
    // Piece values for importance ranking
    const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    
    // For each square, count attackers from each side
    for (const sq of allSquares) {
      const square = sq as Square;
      const piece = this.chess.get(square);
      
      // Count attackers for this square
      const whiteAttackers = this.countAttackers(square, 'w');
      const blackAttackers = this.countAttackers(square, 'b');
      
      if (piece) {
        const enemyColor = piece.color === 'w' ? 'b' : 'w';
        const friendlyColor = piece.color;
        
        const attackers = enemyColor === 'w' ? whiteAttackers : blackAttackers;
        const defenders = friendlyColor === 'w' ? whiteAttackers : blackAttackers;
        
        // Piece is attacked
        if (attackers > 0) {
          attackedPieces.push({
            square: sq,
            piece: piece.type.toUpperCase(),
            color: piece.color,
            attackers,
            defenders,
          });
          
          // Hanging = attacked with fewer defenders than attackers (simplified)
          // Or undefended and attacked
          if (defenders < attackers || defenders === 0) {
            hangingPieces.push({
              square: sq,
              piece: piece.type.toUpperCase(),
              color: piece.color,
              attackers,
              defenders,
            });
            
            // Add threat description for valuable pieces
            if (pieceValues[piece.type] >= 3) {
              const pieceName = this.getPieceName(piece.type);
              threats.push(`${piece.color === 'w' ? 'White' : 'Black'} ${pieceName} on ${sq} is hanging (${attackers} attacker${attackers > 1 ? 's' : ''}, ${defenders} defender${defenders !== 1 ? 's' : ''})`);
            }
          }
        } else if (this.countDefenders(square, piece.color) === 0 && piece.type !== 'k') {
          // Undefended (not attacked, but also not protected)
          undefendedPieces.push({
            square: sq,
            piece: piece.type.toUpperCase(),
            color: piece.color,
          });
        }
      }
      
      // Track key contested squares (center and squares with lots of activity)
      const isCenterSquare = ['d4', 'd5', 'e4', 'e5', 'c4', 'c5', 'f4', 'f5'].includes(sq);
      const totalActivity = whiteAttackers + blackAttackers;
      
      if (isCenterSquare || totalActivity >= 3) {
        keySquares.push({
          square: sq,
          whiteAttackers,
          blackAttackers,
          piece: piece ? `${piece.color === 'w' ? 'W' : 'B'}${piece.type.toUpperCase()}` : undefined,
        });
      }
    }
    
    // Sort by piece value (most valuable hanging pieces first)
    hangingPieces.sort((a, b) => pieceValues[a.piece.toLowerCase()] - pieceValues[b.piece.toLowerCase()]).reverse();
    attackedPieces.sort((a, b) => pieceValues[a.piece.toLowerCase()] - pieceValues[b.piece.toLowerCase()]).reverse();
    
    // Generate summary
    const summary = this.generateTacticalSummary(hangingPieces, attackedPieces, undefendedPieces, threats);
    
    return {
      hangingPieces,
      attackedPieces,
      undefendedPieces,
      keySquares: keySquares.slice(0, 10), // Top 10 most contested
      threats,
      summary,
    };
  }

  /**
   * Count how many pieces of a given color attack a square
   */
  private countAttackers(square: Square, attackingColor: 'w' | 'b'): number {
    // Use chess.js isAttacked and then manually count by trying moves
    if (!this.chess.isAttacked(square, attackingColor)) {
      return 0;
    }
    
    // Get all pieces of attacking color and check if they can move to this square
    let count = 0;
    const board = this.chess.board();
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.color === attackingColor) {
          const fromSquare = this.indexToSquare(rank, file);
          if (this.canAttack(fromSquare, square, piece)) {
            count++;
          }
        }
      }
    }
    
    return count;
  }

  /**
   * Count defenders of a piece on a square
   */
  private countDefenders(square: Square, pieceColor: 'w' | 'b'): number {
    // A piece defends the square if it could capture an enemy piece there
    // We check if friendly pieces attack this square
    return this.countAttackers(square, pieceColor);
  }

  /**
   * Check if a piece can attack a target square (ignoring legality for the full position)
   */
  private canAttack(from: string, to: Square, piece: { type: string; color: 'w' | 'b' }): boolean {
    const fromFile = from.charCodeAt(0) - 97;
    const fromRank = parseInt(from[1]) - 1;
    const toFile = to.charCodeAt(0) - 97;
    const toRank = parseInt(to[1]) - 1;
    
    const fileDiff = Math.abs(toFile - fromFile);
    const rankDiff = Math.abs(toRank - fromRank);
    
    switch (piece.type) {
      case 'p': {
        // Pawns attack diagonally
        const direction = piece.color === 'w' ? 1 : -1;
        return fileDiff === 1 && (toRank - fromRank) === direction;
      }
      case 'n':
        // Knights move in L-shape
        return (fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2);
      case 'b':
        // Bishops move diagonally
        if (fileDiff !== rankDiff) return false;
        return this.isPathClear(from, to, 'diagonal');
      case 'r':
        // Rooks move in straight lines
        if (fileDiff !== 0 && rankDiff !== 0) return false;
        return this.isPathClear(from, to, 'straight');
      case 'q':
        // Queens move like rook or bishop
        if (fileDiff === rankDiff) {
          return this.isPathClear(from, to, 'diagonal');
        } else if (fileDiff === 0 || rankDiff === 0) {
          return this.isPathClear(from, to, 'straight');
        }
        return false;
      case 'k':
        // Kings attack adjacent squares
        return fileDiff <= 1 && rankDiff <= 1 && (fileDiff + rankDiff > 0);
      default:
        return false;
    }
  }

  /**
   * Check if path between two squares is clear (for sliding pieces)
   */
  private isPathClear(from: string, to: string, type: 'diagonal' | 'straight'): boolean {
    const fromFile = from.charCodeAt(0) - 97;
    const fromRank = parseInt(from[1]) - 1;
    const toFile = to.charCodeAt(0) - 97;
    const toRank = parseInt(to[1]) - 1;
    
    const fileStep = Math.sign(toFile - fromFile);
    const rankStep = Math.sign(toRank - fromRank);
    
    let currentFile = fromFile + fileStep;
    let currentRank = fromRank + rankStep;
    
    const board = this.chess.board();
    
    while (currentFile !== toFile || currentRank !== toRank) {
      if (board[7 - currentRank][currentFile]) {
        return false; // Piece blocking
      }
      currentFile += fileStep;
      currentRank += rankStep;
    }
    
    return true;
  }

  private indexToSquare(rank: number, file: number): string {
    return String.fromCharCode(97 + file) + (8 - rank);
  }

  private getAllSquares(): string[] {
    const squares: string[] = [];
    for (let file = 0; file < 8; file++) {
      for (let rank = 1; rank <= 8; rank++) {
        squares.push(String.fromCharCode(97 + file) + rank);
      }
    }
    return squares;
  }

  private getPieceName(type: string): string {
    const names: Record<string, string> = {
      p: 'pawn',
      n: 'knight',
      b: 'bishop',
      r: 'rook',
      q: 'queen',
      k: 'king',
    };
    return names[type] || type;
  }

  private generateTacticalSummary(
    hanging: TacticalAnalysis['hangingPieces'],
    attacked: TacticalAnalysis['attackedPieces'],
    undefended: TacticalAnalysis['undefendedPieces'],
    threats: string[]
  ): string {
    const parts: string[] = [];
    
    if (hanging.length > 0) {
      const hangingDesc = hanging.map(h => 
        `${h.color === 'w' ? 'W' : 'B'}${h.piece}@${h.square}`
      ).join(', ');
      parts.push(`Hanging: ${hangingDesc}`);
    }
    
    if (undefended.length > 0 && undefended.length <= 4) {
      const undefDesc = undefended.map(u =>
        `${u.color === 'w' ? 'W' : 'B'}${u.piece}@${u.square}`
      ).join(', ');
      parts.push(`Undefended: ${undefDesc}`);
    }
    
    if (parts.length === 0) {
      parts.push('No immediate tactical issues');
    }
    
    return parts.join('. ');
  }
}

