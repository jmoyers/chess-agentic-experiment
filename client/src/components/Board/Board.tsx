import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { useBoardStore } from '../../stores/boardStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { Piece } from '../Pieces/Piece';
import type { BoardArrow, SquareHighlight, ArrowColor } from '@chess/shared';
import './Board.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

interface SquareProps {
  square: string;
  isLight: boolean;
  isSelected: boolean;
  isLegalMove: boolean;
  isLastMove: boolean;
  children?: React.ReactNode;
}

// Convert square notation to percentage coordinates (for SVG with viewBox 0-800)
// Using 100 units per square for cleaner math
function squareToCoords(square: string): { x: number; y: number } {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = 8 - parseInt(square[1], 10);
  return {
    x: file * 100 + 50,
    y: rank * 100 + 50,
  };
}

// Render arrows as SVG (using 800x800 viewBox = 100 units per square)
interface BoardArrowsProps {
  arrows: BoardArrow[];
  userArrows: BoardArrow[];
  drawingArrow?: { from: string; to: string; color: ArrowColor } | null;
}

function BoardArrows({ arrows, userArrows, drawingArrow }: BoardArrowsProps) {
  // Filter out any invalid arrows (defensive - in case server sends malformed data)
  const validArrows = [...arrows, ...userArrows].filter(
    (a) => a && typeof a.from === 'string' && typeof a.to === 'string' && a.from.length >= 2 && a.to.length >= 2
  );
  const hasDrawing = drawingArrow && drawingArrow.from !== drawingArrow.to;
  
  if (validArrows.length === 0 && !hasDrawing) return null;

  return (
    <div className="annotations-layer">
      <svg className="annotations-svg" viewBox="0 0 800 800">
        <defs>
          {['green', 'red', 'blue', 'yellow', 'orange', 'purple'].map((color) => (
            <marker
              key={color}
              id={`arrowhead-${color}`}
              markerWidth="4"
              markerHeight="4"
              refX="2"
              refY="2"
              orient="auto"
            >
              <polygon points="0 0, 4 2, 0 4" className={`arrow-head ${color}`} />
            </marker>
          ))}
        </defs>
        {validArrows.map((arrow, idx) => {
          const from = squareToCoords(arrow.from);
          const to = squareToCoords(arrow.to);
          
          // Shorten the arrow slightly so arrowhead doesn't overlap center
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const shortenBy = 20; // Adjusted for 800x800 viewBox
          const endX = to.x - (dx / len) * shortenBy;
          const endY = to.y - (dy / len) * shortenBy;

          return (
            <line
              key={idx}
              x1={from.x}
              y1={from.y}
              x2={endX}
              y2={endY}
              className={`arrow-line ${arrow.color}`}
              strokeWidth="12"
              strokeLinecap="round"
              markerEnd={`url(#arrowhead-${arrow.color})`}
              opacity="0.85"
            />
          );
        })}
        {/* Drawing preview arrow (ghost) */}
        {hasDrawing && (
          (() => {
            const from = squareToCoords(drawingArrow.from);
            const to = squareToCoords(drawingArrow.to);
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const shortenBy = 20;
            const endX = to.x - (dx / len) * shortenBy;
            const endY = to.y - (dy / len) * shortenBy;

            return (
              <line
                x1={from.x}
                y1={from.y}
                x2={endX}
                y2={endY}
                className={`arrow-line ${drawingArrow.color} drawing-preview`}
                strokeWidth="12"
                strokeLinecap="round"
                markerEnd={`url(#arrowhead-${drawingArrow.color})`}
                opacity="0.5"
              />
            );
          })()
        )}
      </svg>
    </div>
  );
}

// Render square highlights as a grid overlay that matches the board
interface SquareHighlightsProps {
  highlights: SquareHighlight[];
  userHighlights: SquareHighlight[];
}

function SquareHighlights({ highlights, userHighlights }: SquareHighlightsProps) {
  const allHighlights = [...highlights, ...userHighlights];
  if (allHighlights.length === 0) return null;

  // Create a lookup for quick access (user highlights override agent highlights)
  const highlightMap = new Map<string, SquareHighlight>();
  for (const h of highlights) {
    highlightMap.set(h.square, h);
  }
  for (const h of userHighlights) {
    highlightMap.set(h.square, h);
  }

  return (
    <div className="highlights-layer">
      {RANKS.map((rank) => (
        <div key={rank} className="highlights-rank">
          {FILES.map((file) => {
            const square = `${file}${rank}`;
            const highlight = highlightMap.get(square);
            
            if (!highlight) {
              return <div key={square} className="highlight-cell" />;
            }
            
            return (
              <div
                key={square}
                className={`highlight-cell square-highlight ${highlight.color} type-${highlight.type}`}
                data-highlight-square={square}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface DroppableSquareWithMoveProps extends SquareProps {
  onMakeMove: (from: string, to: string, promotion?: string) => void;
}

function DroppableSquare({ square, isLight, isSelected, isLegalMove, isLastMove, children, onMakeMove }: DroppableSquareWithMoveProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: square,
  });

  const selectedSquare = useBoardStore((state) => state.selectedSquare);
  const selectSquare = useBoardStore((state) => state.selectSquare);
  const getPieceAt = useBoardStore((state) => state.getPieceAt);

  const handleClick = () => {
    // If there's a selected square and this is a legal move, make the move
    if (selectedSquare && isLegalMove) {
      // Check for pawn promotion
      const piece = getPieceAt(selectedSquare);
      const isPromotion =
        piece?.type === 'p' &&
        ((piece.color === 'w' && square[1] === '8') ||
          (piece.color === 'b' && square[1] === '1'));

      if (isPromotion) {
        onMakeMove(selectedSquare, square, 'q');
      } else {
        onMakeMove(selectedSquare, square);
      }
      selectSquare(null);
    } else {
      // Only select if there's a piece on this square, otherwise deselect
      const pieceOnSquare = getPieceAt(square);
      selectSquare(pieceOnSquare ? square : null);
    }
  };

  const className = [
    'square',
    isLight ? 'light' : 'dark',
    isSelected && 'selected',
    isLegalMove && 'legal-move',
    isLastMove && 'last-move',
    isOver && 'drag-over',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={setNodeRef} className={className} onClick={handleClick} data-square={square}>
      {children}
      {isLegalMove && !children && <div className="legal-move-dot" />}
    </div>
  );
}

interface DraggablePieceProps {
  square: string;
  piece: { type: string; color: string };
}

function DraggablePiece({ square, piece }: DraggablePieceProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${square}-piece`,
    data: { square, piece },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 100 : 1,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`piece-wrapper ${isDragging ? 'dragging' : ''}`}
      style={style}
    >
      <Piece type={piece.type} color={piece.color} />
    </div>
  );
}

// Get square from mouse position relative to board element
function getSquareFromPoint(boardElement: HTMLElement, clientX: number, clientY: number): string | null {
  const rect = boardElement.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  
  const squareSize = rect.width / 8;
  const file = Math.floor(x / squareSize);
  const rank = 7 - Math.floor(y / squareSize);
  
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  
  return `${FILES[file]}${rank + 1}`;
}

export function Board() {
  const fen = useBoardStore((state) => state.fen);
  const selectedSquare = useBoardStore((state) => state.selectedSquare);
  const legalMoves = useBoardStore((state) => state.legalMoves);
  const lastMove = useBoardStore((state) => state.lastMove);
  const getPieceAt = useBoardStore((state) => state.getPieceAt);
  const selectSquare = useBoardStore((state) => state.selectSquare);
  const isLegalMove = useBoardStore((state) => state.isLegalMove);
  const arrows = useBoardStore((state) => state.arrows);
  const highlights = useBoardStore((state) => state.highlights);
  const userArrows = useBoardStore((state) => state.userArrows);
  const userHighlights = useBoardStore((state) => state.userHighlights);
  const toggleUserArrow = useBoardStore((state) => state.toggleUserArrow);
  const toggleUserHighlight = useBoardStore((state) => state.toggleUserHighlight);
  const clearUserAnnotations = useBoardStore((state) => state.clearUserAnnotations);
  const virtualState = useBoardStore((state) => state.virtualState);
  const makeMove = useConnectionStore((state) => state.makeMove);
  
  // Arrow drawing state
  const [drawingArrow, setDrawingArrow] = useState<{ from: string; to: string; color: ArrowColor } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const isRightMouseDown = useRef(false);
  
  // Escape key to clear user annotations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearUserAnnotations();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearUserAnnotations]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const square = event.active.data.current?.square;
      if (square) {
        selectSquare(square);
      }
    },
    [selectSquare]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const fromSquare = active.data.current?.square;

      // If no drop target, keep the piece selected (for click-to-move)
      if (!over) {
        // Don't clear selection - this allows click-to-move workflow
        return;
      }

      const toSquare = over.id as string;

      // If dropped on the same square, keep it selected
      if (fromSquare === toSquare) {
        return;
      }

      if (fromSquare && toSquare) {
        if (isLegalMove(fromSquare, toSquare)) {
          // Check for pawn promotion
          const piece = getPieceAt(fromSquare);
          const isPromotion =
            piece?.type === 'p' &&
            ((piece.color === 'w' && toSquare[1] === '8') ||
              (piece.color === 'b' && toSquare[1] === '1'));

          if (isPromotion) {
            // Default to queen promotion, could add UI for selection
            makeMove(fromSquare, toSquare, 'q');
          } else {
            makeMove(fromSquare, toSquare);
          }
          selectSquare(null);
        } else {
          // Invalid move - just select the destination if it has a piece
          selectSquare(toSquare);
        }
      }
    },
    [selectSquare, isLegalMove, makeMove, getPieceAt]
  );
  
  // Right-click handling for arrows and highlights
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // Prevent browser context menu
  }, []);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Left-click (button 0) clears user annotations
    if (e.button === 0) {
      // Clear user-drawn arrows and highlights on left-click
      // This is standard chess UI behavior (like Lichess/Chess.com)
      if (userArrows.length > 0 || userHighlights.length > 0) {
        clearUserAnnotations();
      }
      return;
    }
    
    // Right-click (button 2) for drawing arrows/highlights
    if (e.button !== 2) return;
    
    e.preventDefault();
    isRightMouseDown.current = true;
    
    const boardElement = boardRef.current?.querySelector('.board') as HTMLElement | null;
    if (!boardElement) return;
    
    const square = getSquareFromPoint(boardElement, e.clientX, e.clientY);
    if (!square) return;
    
    // Start drawing arrow from this square
    setDrawingArrow({ from: square, to: square, color: 'green' });
  }, [userArrows.length, userHighlights.length, clearUserAnnotations]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isRightMouseDown.current || !drawingArrow) return;
    
    const boardElement = boardRef.current?.querySelector('.board') as HTMLElement | null;
    if (!boardElement) return;
    
    const square = getSquareFromPoint(boardElement, e.clientX, e.clientY);
    if (!square) return;
    
    // Update the arrow target
    if (square !== drawingArrow.to) {
      setDrawingArrow({ ...drawingArrow, to: square });
    }
  }, [drawingArrow]);
  
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Only handle right-click release
    if (e.button !== 2) return;
    
    isRightMouseDown.current = false;
    
    if (!drawingArrow) return;
    
    const { from, to } = drawingArrow;
    
    if (from === to) {
      // Same square = toggle highlight
      toggleUserHighlight(from, 'green');
    } else {
      // Different squares = toggle arrow
      toggleUserArrow(from, to, 'green');
    }
    
    setDrawingArrow(null);
  }, [drawingArrow, toggleUserArrow, toggleUserHighlight]);
  
  // Clean up on mouse leave (in case mouse leaves while drawing)
  const handleMouseLeave = useCallback(() => {
    if (isRightMouseDown.current) {
      isRightMouseDown.current = false;
      setDrawingArrow(null);
    }
  }, []);

  const renderSquare = (file: string, rank: number) => {
    const square = `${file}${rank}`;
    const isLight = (FILES.indexOf(file) + rank) % 2 === 0;
    const piece = getPieceAt(square);
    const isSelected = selectedSquare === square;
    const isLegalMoveSquare = legalMoves.includes(square);
    const isLastMoveSquare = lastMove?.from === square || lastMove?.to === square;

    return (
      <DroppableSquare
        key={square}
        square={square}
        isLight={isLight}
        isSelected={isSelected}
        isLegalMove={isLegalMoveSquare}
        isLastMove={isLastMoveSquare}
        onMakeMove={makeMove}
      >
        {piece && <DraggablePiece square={square} piece={piece} />}
      </DroppableSquare>
    );
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div 
        className="board-container"
        ref={boardRef}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {virtualState.isActive && (
          <div className="virtual-mode-indicator">Analysis</div>
        )}
        <SquareHighlights highlights={highlights} userHighlights={userHighlights} />
        <div className="board">
          {RANKS.map((rank) => (
            <div key={rank} className="rank">
              {FILES.map((file) => renderSquare(file, rank))}
            </div>
          ))}
        </div>
        <BoardArrows arrows={arrows} userArrows={userArrows} drawingArrow={drawingArrow} />
        <div className="file-labels">
          {FILES.map((file) => (
            <span key={file} className="file-label">
              {file}
            </span>
          ))}
        </div>
        <div className="rank-labels">
          {RANKS.map((rank) => (
            <span key={rank} className="rank-label">
              {rank}
            </span>
          ))}
        </div>
      </div>
    </DndContext>
  );
}

