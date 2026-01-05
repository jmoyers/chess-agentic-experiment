import { useBoardStore } from '../../stores/boardStore';
import './MoveList.css';

export function MoveList() {
  const history = useBoardStore((state) => state.history);
  const currentMoveIndex = useBoardStore((state) => state.currentMoveIndex);
  const navigateToMove = useBoardStore((state) => state.navigateToMove);

  const moves: { moveNum: number; white?: string; black?: string; whiteIndex: number; blackIndex?: number }[] = [];

  for (let i = 0; i < history.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    moves.push({
      moveNum,
      white: history[i]?.san,
      black: history[i + 1]?.san,
      whiteIndex: i + 1,
      blackIndex: history[i + 1] ? i + 2 : undefined,
    });
  }

  const handleMoveClick = (index: number) => {
    navigateToMove(index);
  };

  return (
    <div className="move-list-container">
      <div className="move-list-header">
        <h3>Moves</h3>
        <span className="move-count">
          {currentMoveIndex} / {history.length}
        </span>
      </div>

      <div className="move-list">
        <div
          className={`move-item start ${currentMoveIndex === 0 ? 'current' : ''}`}
          onClick={() => handleMoveClick(0)}
        >
          <span className="move-number">·</span>
          <span className="move-san">Start</span>
        </div>

        {moves.map(({ moveNum, white, black, whiteIndex, blackIndex }) => (
          <div key={moveNum} className="move-row">
            <span className="move-number">{moveNum}.</span>
            {white && (
              <span
                className={`move-san white ${currentMoveIndex === whiteIndex ? 'current' : ''}`}
                onClick={() => handleMoveClick(whiteIndex)}
              >
                {white}
              </span>
            )}
            {black && blackIndex && (
              <span
                className={`move-san black ${currentMoveIndex === blackIndex ? 'current' : ''}`}
                onClick={() => handleMoveClick(blackIndex)}
              >
                {black}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="move-list-hint">
        <span>← → navigate • ↑ start • ↓ end</span>
      </div>
    </div>
  );
}

