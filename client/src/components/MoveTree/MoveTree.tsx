import { useBoardStore } from '../../stores/boardStore';
import { useConnectionStore } from '../../stores/connectionStore';
import './MoveTree.css';

export function MoveTree() {
  const history = useBoardStore((state) => state.history);
  const currentMoveIndex = useBoardStore((state) => state.currentMoveIndex);
  const navigateToMove = useBoardStore((state) => state.navigateToMove);
  const virtualState = useBoardStore((state) => state.virtualState);
  const navigateVirtual = useBoardStore((state) => state.navigateVirtual);
  const exitVirtualMode = useConnectionStore((state) => state.exitVirtualMode);

  // Build move pairs for display
  const movePairs: {
    moveNum: number;
    white?: { san: string; index: number };
    black?: { san: string; index: number };
  }[] = [];

  for (let i = 0; i < history.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    movePairs.push({
      moveNum,
      white: history[i] ? { san: history[i].san || '', index: i + 1 } : undefined,
      black: history[i + 1]
        ? { san: history[i + 1].san || '', index: i + 2 }
        : undefined,
    });
  }

  // Build virtual move pairs
  const virtualMovePairs: {
    moveNum: number;
    white?: { san: string; index: number };
    black?: { san: string; index: number };
  }[] = [];

  if (virtualState.isActive && virtualState.virtualMoves.length > 0) {
    // Determine starting move number based on base position
    const baseMoveNum = Math.floor(virtualState.baseIndex / 2) + 1;
    const startsWithBlack = virtualState.baseIndex % 2 === 1;

    let virtualMoveIndex = 0;
    let currentMoveNum = baseMoveNum;

    if (startsWithBlack && virtualState.virtualMoves.length > 0) {
      // First virtual move is black's move
      virtualMovePairs.push({
        moveNum: currentMoveNum,
        white: undefined,
        black: {
          san: virtualState.virtualMoves[0].san || '',
          index: 1,
        },
      });
      virtualMoveIndex = 1;
      currentMoveNum++;
    }

    while (virtualMoveIndex < virtualState.virtualMoves.length) {
      const whiteMove = virtualState.virtualMoves[virtualMoveIndex];
      const blackMove = virtualState.virtualMoves[virtualMoveIndex + 1];

      virtualMovePairs.push({
        moveNum: currentMoveNum,
        white: whiteMove
          ? { san: whiteMove.san || '', index: virtualMoveIndex + 1 }
          : undefined,
        black: blackMove
          ? { san: blackMove.san || '', index: virtualMoveIndex + 2 }
          : undefined,
      });

      virtualMoveIndex += 2;
      currentMoveNum++;
    }
  }

  const handleMoveClick = (index: number) => {
    navigateToMove(index);
  };

  const handleVirtualMoveClick = (index: number) => {
    navigateVirtual(index);
  };

  const handleExitVirtual = () => {
    exitVirtualMode();
  };

  return (
    <div className="move-tree-container">
      <div className="move-tree-header">
        <h3>
          {virtualState.isActive ? (
            <>
              <span className="virtual-indicator">●</span> Analysis Mode
            </>
          ) : (
            'Moves'
          )}
        </h3>
        <span className="move-count">
          {virtualState.isActive
            ? `Virtual: ${virtualState.currentVirtualIndex}/${virtualState.virtualMoves.length}`
            : `${currentMoveIndex} / ${history.length}`}
        </span>
      </div>

      <div className="move-tree">
        {/* Starting position */}
        <div
          className={`move-tree-item start ${!virtualState.isActive && currentMoveIndex === 0 ? 'current' : ''}`}
          onClick={() => handleMoveClick(0)}
        >
          <span className="move-number">·</span>
          <span className="move-san">Start</span>
        </div>

        {/* Main line moves */}
        {movePairs.map(({ moveNum, white, black }) => (
          <div key={moveNum} className="move-tree-row">
            <span className="move-number">{moveNum}.</span>
            {white && (
              <span
                className={`move-san white ${!virtualState.isActive && currentMoveIndex === white.index ? 'current' : ''} ${virtualState.isActive && virtualState.baseIndex === white.index ? 'branch-point' : ''}`}
                onClick={() => handleMoveClick(white.index)}
              >
                {white.san}
              </span>
            )}
            {black && (
              <span
                className={`move-san black ${!virtualState.isActive && currentMoveIndex === black.index ? 'current' : ''} ${virtualState.isActive && virtualState.baseIndex === black.index ? 'branch-point' : ''}`}
                onClick={() => handleMoveClick(black.index)}
              >
                {black.san}
              </span>
            )}
          </div>
        ))}

        {/* Virtual/Analysis moves */}
        {virtualState.isActive && virtualMovePairs.length > 0 && (
          <>
            <div className="virtual-separator">
              <span className="separator-line" />
              <span className="separator-text">Analysis</span>
              <span className="separator-line" />
            </div>

            {virtualMovePairs.map(({ moveNum, white, black }, idx) => (
              <div key={`v-${idx}`} className="move-tree-row virtual">
                <span className="move-number">{moveNum}.</span>
                {white && (
                  <span
                    className={`move-san white virtual ${virtualState.currentVirtualIndex === white.index ? 'current' : ''}`}
                    onClick={() => handleVirtualMoveClick(white.index)}
                  >
                    {white.san}
                  </span>
                )}
                {black && (
                  <span
                    className={`move-san black virtual ${virtualState.currentVirtualIndex === black.index ? 'current' : ''}`}
                    onClick={() => handleVirtualMoveClick(black.index)}
                  >
                    {black.san}
                  </span>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {virtualState.isActive && (
        <div className="virtual-controls">
          <button className="exit-virtual-btn" onClick={handleExitVirtual}>
            ↩ Exit Analysis
          </button>
          <div className="virtual-nav">
            <button
              onClick={() => navigateVirtual(virtualState.currentVirtualIndex - 1)}
              disabled={virtualState.currentVirtualIndex <= 0}
            >
              ←
            </button>
            <button
              onClick={() => navigateVirtual(virtualState.currentVirtualIndex + 1)}
              disabled={
                virtualState.currentVirtualIndex >= virtualState.virtualMoves.length
              }
            >
              →
            </button>
          </div>
        </div>
      )}

      <div className="move-tree-hint">
        {virtualState.isActive ? (
          <span>Esc to exit • ← → navigate analysis</span>
        ) : (
          <span>← → navigate • ↑ start • ↓ end</span>
        )}
      </div>
    </div>
  );
}


