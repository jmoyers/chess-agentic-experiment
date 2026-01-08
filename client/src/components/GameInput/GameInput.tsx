import { useState, useCallback } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import './GameInput.css';

type InputType = 'fen' | 'pgn' | 'auto';

function detectInputType(input: string): 'fen' | 'pgn' {
  const trimmed = input.trim();
  
  // FEN has exactly 6 space-separated parts and starts with piece placement
  const parts = trimmed.split(/\s+/);
  if (parts.length === 6) {
    // Check if first part looks like FEN piece placement (contains / and piece letters)
    const piecePlacement = parts[0];
    if (piecePlacement.includes('/') && /^[rnbqkpRNBQKP1-8/]+$/.test(piecePlacement)) {
      return 'fen';
    }
  }
  
  // Otherwise assume PGN
  return 'pgn';
}

export function GameInput() {
  const [input, setInput] = useState('');
  const [inputType, setInputType] = useState<InputType>('auto');
  const [isExpanded, setIsExpanded] = useState(false);
  const loadGame = useConnectionStore((state) => state.loadGame);
  const resetGame = useConnectionStore((state) => state.resetGame);

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    
    const type = inputType === 'auto' ? detectInputType(input) : inputType;
    loadGame(type, input.trim());
    setInput('');
    setIsExpanded(false);
  }, [input, inputType, loadGame]);

  const handleReset = useCallback(() => {
    resetGame();
    setInput('');
  }, [resetGame]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSubmit();
    }
  };

  return (
    <div className={`game-input-container ${isExpanded ? 'expanded' : ''}`}>
      {!isExpanded ? (
        <button className="expand-btn" onClick={() => setIsExpanded(true)}>
          <span>Load Position</span>
          <span className="hint">Paste FEN or PGN</span>
        </button>
      ) : (
        <div className="game-input-form">
          <div className="input-header">
            <div className="input-type-selector">
              <button
                className={inputType === 'auto' ? 'active' : ''}
                onClick={() => setInputType('auto')}
              >
                Auto
              </button>
              <button
                className={inputType === 'fen' ? 'active' : ''}
                onClick={() => setInputType('fen')}
              >
                FEN
              </button>
              <button
                className={inputType === 'pgn' ? 'active' : ''}
                onClick={() => setInputType('pgn')}
              >
                PGN
              </button>
            </div>
            <button className="close-btn" onClick={() => setIsExpanded(false)}>
              ×
            </button>
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              inputType === 'fen'
                ? 'Paste FEN string...\ne.g., rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
                : inputType === 'pgn'
                ? 'Paste PGN...\ne.g., 1. e4 e5 2. Nf3 Nc6 3. Bb5'
                : 'Paste FEN or PGN (auto-detected)...'
            }
            rows={4}
            autoFocus
          />

          <div className="input-actions">
            <button className="reset-btn" onClick={handleReset}>
              Reset Board
            </button>
            <button
              className="submit-btn"
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              Load Position
            </button>
          </div>

          <div className="input-hint">
            Press ⌘ + Enter to submit
          </div>
        </div>
      )}
    </div>
  );
}


