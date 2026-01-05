import { useEffect, useRef } from 'react';
import { useBoardStore } from '../../stores/boardStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useExplorerStore, formatGameCount, getTopMoves, type ExplorerSource } from '../../stores/explorerStore';
import type { ExplorerResult, ExplorerMoveStats } from '@chess/shared';
import './OpeningExplorer.css';

interface MoveRowProps {
  move: ExplorerMoveStats;
  totalGames: number;
}

function MoveRow({ move, totalGames }: MoveRowProps) {
  const makeMove = useConnectionStore((s) => s.makeMove);
  
  const handleClick = () => {
    if (move.uci && move.uci.length >= 4) {
      const from = move.uci.slice(0, 2);
      const to = move.uci.slice(2, 4);
      const promotion = move.uci.length > 4 ? move.uci[4] : undefined;
      makeMove(from, to, promotion);
    }
  };
  
  const playRate = totalGames > 0 ? (move.totalGames / totalGames) * 100 : 0;
  
  return (
    <div className="explorer-move-row" onClick={handleClick}>
      <div className="move-cell move-san">{move.san}</div>
      <div className="move-cell move-games">
        <span className="games-pct">{playRate.toFixed(0)}%</span>
        <span className="games-count">{formatGameCount(move.totalGames)}</span>
      </div>
      <div className="move-cell move-bar">
        <div className="result-bar">
          <div 
            className="bar-segment white" 
            style={{ width: `${move.whiteWinPercent}%` }}
            title={`White: ${move.whiteWinPercent.toFixed(1)}%`}
          />
          <div 
            className="bar-segment draw" 
            style={{ width: `${move.drawPercent}%` }}
            title={`Draw: ${move.drawPercent.toFixed(1)}%`}
          />
          <div 
            className="bar-segment black" 
            style={{ width: `${move.blackWinPercent}%` }}
            title={`Black: ${move.blackWinPercent.toFixed(1)}%`}
          />
        </div>
      </div>
    </div>
  );
}

interface DatabasePanelProps {
  title: string;
  result: ExplorerResult | null;
  isLoading: boolean;
  error: string | null;
}

function DatabasePanel({ title, result, isLoading, error }: DatabasePanelProps) {
  const topMoves = getTopMoves(result, 8);
  const totalGames = result?.stats.totalGames ?? 0;
  
  return (
    <div className="database-panel">
      <div className="database-header">
        <span className="database-title">{title}</span>
        {result && totalGames > 0 && (
          <span className="database-total">{formatGameCount(totalGames)}</span>
        )}
      </div>
      
      <div className="database-content">
        {isLoading && (
          <div className="explorer-loading">
            <div className="loading-spinner" />
          </div>
        )}
        
        {error && (
          <div className="explorer-error">
            {error}
          </div>
        )}
        
        {!isLoading && !error && result && (
          <>
            {/* Moves list */}
            <div className="explorer-moves">
              {topMoves.length > 0 ? (
                topMoves.map((move) => (
                  <MoveRow 
                    key={move.uci} 
                    move={move} 
                    totalGames={totalGames}
                  />
                ))
              ) : (
                <div className="explorer-empty">
                  No games found
                </div>
              )}
            </div>
            
            {/* Summary row */}
            {totalGames > 0 && (
              <div className="explorer-summary">
                <div className="summary-bar">
                  <div className="result-bar">
                    <div 
                      className="bar-segment white" 
                      style={{ width: `${result.stats.whiteWinPercent}%` }}
                    />
                    <div 
                      className="bar-segment draw" 
                      style={{ width: `${result.stats.drawPercent}%` }}
                    />
                    <div 
                      className="bar-segment black" 
                      style={{ width: `${result.stats.blackWinPercent}%` }}
                    />
                  </div>
                  <div className="summary-percents">
                    <span className="pct white">{result.stats.whiteWinPercent.toFixed(0)}%</span>
                    <span className="pct draw">{result.stats.drawPercent.toFixed(0)}%</span>
                    <span className="pct black">{result.stats.blackWinPercent.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        
        {!isLoading && !error && !result && (
          <div className="explorer-empty">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}

interface SourceToggleProps {
  activeSource: ExplorerSource;
  localAvailable: boolean;
  localPositionCount?: number;
  onToggle: (source: ExplorerSource) => void;
}

function SourceToggle({ activeSource, localAvailable, localPositionCount, onToggle }: SourceToggleProps) {
  return (
    <div className="explorer-source-toggle">
      <button
        className={`source-btn ${activeSource === 'remote' ? 'active' : ''}`}
        onClick={() => onToggle('remote')}
        title="Query Lichess API"
      >
        <span className="source-icon">🌐</span>
        <span className="source-label">Remote</span>
      </button>
      <button
        className={`source-btn ${activeSource === 'local' ? 'active' : ''} ${!localAvailable ? 'disabled' : ''}`}
        onClick={() => localAvailable && onToggle('local')}
        disabled={!localAvailable}
        title={localAvailable 
          ? `Local database (${formatGameCount(localPositionCount || 0)} positions)` 
          : 'Local database not available'
        }
      >
        <span className="source-icon">💾</span>
        <span className="source-label">Local</span>
        {!localAvailable && <span className="source-unavailable">—</span>}
      </button>
    </div>
  );
}

export function OpeningExplorer() {
  const fen = useBoardStore((s) => s.fen);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const requestExplorer = useConnectionStore((s) => s.requestExplorer);
  const fetchExplorerStatus = useConnectionStore((s) => s.fetchExplorerStatus);
  
  const { 
    activeSource,
    localAvailable,
    localPositionCount,
    mastersResult, lichessResult, localResult,
    mastersLoading, lichessLoading, localLoading,
    mastersError, lichessError, localError,
    lastQueriedFen,
    setActiveSource,
  } = useExplorerStore();
  
  const prevFenRef = useRef<string | null>(null);
  const prevSourceRef = useRef<ExplorerSource | null>(null);
  const hasInitialFetch = useRef(false);
  const hasStatusFetch = useRef(false);
  
  // Fetch explorer status on connect (reset on disconnect)
  useEffect(() => {
    if (!isConnected) {
      hasStatusFetch.current = false;
      return;
    }
    if (!hasStatusFetch.current) {
      hasStatusFetch.current = true;
      fetchExplorerStatus();
    }
  }, [isConnected, fetchExplorerStatus]);
  
  // Fetch explorer data when position changes or connection established
  useEffect(() => {
    if (!isConnected) {
      hasInitialFetch.current = false;
      return;
    }
    
    // Fetch when: first connection, FEN changes, or source changes
    const needsFetch = !hasInitialFetch.current || 
                       fen !== prevFenRef.current || 
                       fen !== lastQueriedFen ||
                       activeSource !== prevSourceRef.current;
    
    if (needsFetch) {
      hasInitialFetch.current = true;
      prevFenRef.current = fen;
      prevSourceRef.current = activeSource;
      useExplorerStore.getState().setLastQueriedFen(fen);
      requestExplorer(fen);
    }
  }, [fen, isConnected, requestExplorer, lastQueriedFen, activeSource]);
  
  // Handle source toggle
  const handleSourceToggle = (source: ExplorerSource) => {
    if (source !== activeSource) {
      setActiveSource(source);
      // Clear previous source results to force re-fetch
      useExplorerStore.getState().clear();
    }
  };
  
  // Get opening name from appropriate result
  const opening = activeSource === 'local' 
    ? localResult?.opening 
    : (mastersResult?.opening || lichessResult?.opening);
  
  return (
    <div className="opening-explorer">
      {/* Source toggle */}
      <SourceToggle
        activeSource={activeSource}
        localAvailable={localAvailable}
        localPositionCount={localPositionCount}
        onToggle={handleSourceToggle}
      />
      
      {/* Opening name header */}
      {opening && (
        <div className="explorer-opening">
          <span className="eco">{opening.eco}</span>
          <span className="name">{opening.name}</span>
        </div>
      )}
      
      {/* Database panels based on active source */}
      {activeSource === 'local' ? (
        <div className="explorer-panels single">
          <DatabasePanel
            title="Local Database"
            result={localResult}
            isLoading={localLoading}
            error={localError}
          />
        </div>
      ) : (
        <div className="explorer-panels">
          <DatabasePanel
            title="Masters"
            result={mastersResult}
            isLoading={mastersLoading}
            error={mastersError}
          />
          <DatabasePanel
            title="Lichess"
            result={lichessResult}
            isLoading={lichessLoading}
            error={lichessError}
          />
        </div>
      )}
    </div>
  );
}
