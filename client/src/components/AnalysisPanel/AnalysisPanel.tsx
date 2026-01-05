import { useEffect, useRef, useCallback } from 'react';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useBoardStore } from '../../stores/boardStore';
import type { AnalysisLine } from '@chess/shared';
import './AnalysisPanel.css';

// Convert UCI move to more readable format
function formatMove(uci: string): string {
  if (!uci || uci.length < 4) return uci;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.length > 4 ? `=${uci[4].toUpperCase()}` : '';
  return `${from}-${to}${promo}`;
}

// Format score for display
function formatScore(line: AnalysisLine, isWhiteTurn: boolean): string {
  const { score } = line;
  
  if (score.type === 'mate') {
    const mateIn = score.value;
    // Positive mate = White is mating, Negative = Black is mating
    return `M${Math.abs(mateIn)}`;
  }
  
  // Convert centipawns to pawns
  const pawns = score.value / 100;
  // From White's perspective
  const whiteScore = isWhiteTurn ? pawns : -pawns;
  
  if (whiteScore === 0) return '0.0';
  return whiteScore > 0 ? `+${whiteScore.toFixed(1)}` : whiteScore.toFixed(1);
}

// Get eval bar percentage (0-100, where 50 is equal)
function getEvalPercent(line: AnalysisLine | undefined, isWhiteTurn: boolean): number {
  if (!line) return 50;
  
  const { score } = line;
  
  if (score.type === 'mate') {
    const isMatingWhite = score.value > 0 === isWhiteTurn;
    // Winning side gets near-full bar
    return isMatingWhite ? 95 : 5;
  }
  
  // Convert centipawns to eval percentage
  // Using sigmoid-like function to map any eval to 0-100
  const cp = isWhiteTurn ? score.value : -score.value;
  const winProb = 1 / (1 + Math.exp(-cp / 400)); // Approximate win probability
  return Math.max(2, Math.min(98, winProb * 100));
}

// Get score class for coloring
function getScoreClass(line: AnalysisLine, isWhiteTurn: boolean): string {
  const { score } = line;
  
  if (score.type === 'mate') {
    const isMatingWhite = score.value > 0 === isWhiteTurn;
    return isMatingWhite ? 'winning' : 'losing';
  }
  
  const cp = isWhiteTurn ? score.value : -score.value;
  if (cp > 100) return 'winning';
  if (cp > 30) return 'better';
  if (cp > -30) return 'equal';
  if (cp > -100) return 'worse';
  return 'losing';
}

interface AnalysisLineRowProps {
  line: AnalysisLine;
  rank: number;
  isWhiteTurn: boolean;
}

function AnalysisLineRow({ line, rank, isWhiteTurn }: AnalysisLineRowProps) {
  const makeMove = useConnectionStore((s) => s.makeMove);
  
  const score = formatScore(line, isWhiteTurn);
  const scoreClass = getScoreClass(line, isWhiteTurn);
  
  // First move in the line (for click-to-play)
  const firstMove = line.moves[0];
  
  // Format PV moves (show first 6-8 moves)
  const pvMoves = line.moves.slice(0, 8).map(formatMove).join(' ');
  
  const handleClick = useCallback(() => {
    if (firstMove && firstMove.length >= 4) {
      const from = firstMove.slice(0, 2);
      const to = firstMove.slice(2, 4);
      const promotion = firstMove.length > 4 ? firstMove[4] : undefined;
      makeMove(from, to, promotion);
    }
  }, [firstMove, makeMove]);
  
  return (
    <div 
      className="analysis-line" 
      data-rank={rank}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      title={firstMove ? `Play ${formatMove(firstMove)}` : undefined}
    >
      <span className={`line-score ${scoreClass}`}>{score}</span>
      <span className="line-moves">{pvMoves}</span>
    </div>
  );
}

interface EvalBarProps {
  evalPercent: number;
  score: string;
}

function EvalBar({ evalPercent, score }: EvalBarProps) {
  return (
    <div className="eval-bar">
      <div className="eval-bar-inner">
        <div 
          className="eval-bar-white" 
          style={{ height: `${evalPercent}%` }}
        />
        <div 
          className="eval-bar-black" 
          style={{ height: `${100 - evalPercent}%` }}
        />
      </div>
      <div className="eval-score">{score}</div>
    </div>
  );
}

export function AnalysisPanel() {
  const socket = useConnectionStore((state) => state.socket);
  const isConnected = useConnectionStore((state) => state.isConnected);
  const fen = useBoardStore((state) => state.fen);
  const turn = useBoardStore((state) => state.turn);
  
  const {
    engineInfo,
    isAnalyzing,
    lines,
    currentDepth,
    options,
    error,
    startAnalysis,
    setOptions,
  } = useAnalysisStore();
  
  const lastFenRef = useRef<string | null>(null);
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Start analysis when position changes
  const requestAnalysis = useCallback((fenToAnalyze: string) => {
    if (!socket || !isConnected) return;
    
    // Stop any existing analysis first
    socket.emit('analysis:stop');
    
    // Clear any pending timeout
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current);
    }
    
    // Small delay to debounce rapid position changes
    analysisTimeoutRef.current = setTimeout(() => {
      startAnalysis(fenToAnalyze);
      socket.emit('analysis:start', { 
        fen: fenToAnalyze, 
        options: {
          ...options,
          infinite: true, // Always use infinite for interactive analysis
        }
      });
    }, 100);
  }, [socket, isConnected, options, startAnalysis]);
  
  // Auto-analyze when position changes
  useEffect(() => {
    if (!isConnected || !fen) return;
    
    // Only analyze if position actually changed
    if (fen !== lastFenRef.current) {
      lastFenRef.current = fen;
      requestAnalysis(fen);
    }
    
    // Cleanup on unmount
    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }
    };
  }, [fen, isConnected, requestAnalysis]);
  
  // Stop analysis when component unmounts or disconnects
  useEffect(() => {
    return () => {
      if (socket?.connected) {
        socket.emit('analysis:stop');
      }
    };
  }, [socket]);
  
  // Handle MultiPV change
  const handleMultiPvChange = (newMultiPv: number) => {
    setOptions({ multiPv: newMultiPv });
    // Restart analysis with new setting
    if (fen && socket?.connected) {
      socket.emit('analysis:configure', { multiPv: newMultiPv });
      requestAnalysis(fen);
    }
  };
  
  const isWhiteTurn = turn === 'w';
  const topLine = lines[0];
  const evalPercent = getEvalPercent(topLine, isWhiteTurn);
  const evalScore = topLine ? formatScore(topLine, isWhiteTurn) : '0.0';
  
  // Sort lines by PV number
  const sortedLines = [...lines].sort((a, b) => a.pv - b.pv);
  
  return (
    <div className="analysis-panel">
      <EvalBar evalPercent={evalPercent} score={evalScore} />
      
      <div className="analysis-content">
        <div className="analysis-header">
          <div className="engine-info">
            {engineInfo ? (
              <>
                <span className="engine-name">{engineInfo.name.replace('Stockfish ', 'SF ')}</span>
                {engineInfo.nnue && <span className="nnue-badge">NNUE</span>}
              </>
            ) : (
              <span className="engine-name">Stockfish</span>
            )}
          </div>
          <div className="analysis-depth">
            {isAnalyzing && <span className="analyzing-indicator" />}
            <span>Depth {currentDepth}</span>
          </div>
        </div>
        
        <div className="analysis-lines">
          {error ? (
            <div className="analysis-error">{error}</div>
          ) : sortedLines.length > 0 ? (
            sortedLines.map((line, idx) => (
              <AnalysisLineRow 
                key={line.pv} 
                line={line} 
                rank={idx + 1}
                isWhiteTurn={isWhiteTurn}
              />
            ))
          ) : isAnalyzing ? (
            <div className="analysis-loading">Analyzing...</div>
          ) : (
            <div className="analysis-empty">Position not analyzed</div>
          )}
        </div>
        
        <div className="analysis-controls">
          <select 
            className="multipv-select"
            value={options.multiPv || 1}
            onChange={(e) => handleMultiPvChange(parseInt(e.target.value, 10))}
          >
            <option value={1}>1 line</option>
            <option value={3}>3 lines</option>
            <option value={5}>5 lines</option>
          </select>
        </div>
      </div>
    </div>
  );
}

