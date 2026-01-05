import { useBoardStore } from '../../stores/boardStore';
import './TurnIndicator.css';

export function TurnIndicator() {
  const turn = useBoardStore((state) => state.turn);
  const isCheck = useBoardStore((state) => state.isCheck);
  const isCheckmate = useBoardStore((state) => state.isCheckmate);
  const isStalemate = useBoardStore((state) => state.isStalemate);
  const isDraw = useBoardStore((state) => state.isDraw);
  const isGameOver = useBoardStore((state) => state.isGameOver);
  const animationState = useBoardStore((state) => state.animationState);
  const virtualState = useBoardStore((state) => state.virtualState);

  const isWhite = turn === 'w';
  const turnText = isWhite ? 'White' : 'Black';

  // Determine status text
  let statusText = `${turnText} to move`;
  let statusClass = '';

  if (isCheckmate) {
    statusText = `Checkmate! ${isWhite ? 'Black' : 'White'} wins`;
    statusClass = 'checkmate';
  } else if (isStalemate) {
    statusText = 'Stalemate - Draw';
    statusClass = 'draw';
  } else if (isDraw) {
    statusText = 'Draw';
    statusClass = 'draw';
  } else if (isCheck) {
    statusText = `${turnText} to move - Check!`;
    statusClass = 'check';
  }

  // Animation indicator - inline version
  if (animationState.isAnimating) {
    return (
      <div className="turn-indicator animating">
        <div className="animation-progress">
          <span className="animation-label">Playing</span>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ 
                width: `${(animationState.currentMoveIndex / animationState.totalMoves) * 100}%` 
              }}
            />
          </div>
          <span className="animation-counter">
            {animationState.currentMoveIndex}/{animationState.totalMoves}
          </span>
        </div>
      </div>
    );
  }

  // Virtual mode indicator - inline version
  if (virtualState.isActive) {
    return (
      <div className="turn-indicator virtual">
        <span className="virtual-badge">Analysis</span>
        <span className="turn-text">{statusText}</span>
        <span className="virtual-hint">Esc to exit</span>
      </div>
    );
  }

  return (
    <div className={`turn-indicator ${statusClass}`}>
      <div className={`turn-piece ${isWhite ? 'white' : 'black'}`}>
        <svg viewBox="0 0 45 45" width="24" height="24">
          {/* King piece silhouette */}
          <g fill={isWhite ? '#fff' : '#333'} stroke={isWhite ? '#333' : '#fff'} strokeWidth="1.5">
            <path d="M22.5,11.63V6M20,8h5" strokeLinejoin="round"/>
            <path d="M22.5,25s4.5-7.5,3-10.5c0,0-1-2.5-3-2.5s-3,2.5-3,2.5c-1.5,3,3,10.5,3,10.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12.5,37c5.5,3.5,14.5,3.5,20,0v-7s9-4.5,6-10.5c-4-6.5-13.5-3.5-16,4V27v-3.5c-2.5-7.5-12-10.5-16-4c-3,6,6,10.5,6,10.5v7" strokeLinecap="round"/>
            <path d="M12.5,30c5.5-3,14.5-3,20,0M12.5,33.5c5.5-3,14.5-3,20,0M12.5,37c5.5-3,14.5-3,20,0"/>
          </g>
        </svg>
      </div>
      <span className="turn-text">{statusText}</span>
    </div>
  );
}

