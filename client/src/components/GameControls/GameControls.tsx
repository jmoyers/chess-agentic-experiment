import { useState } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useConversationStore } from '../../stores/conversationStore';
import { useUrlStore } from '../../stores/urlStore';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import './GameControls.css';

export function GameControls() {
  const [showConfirm, setShowConfirm] = useState(false);
  const resetGame = useConnectionStore((state) => state.resetGame);
  const createConversation = useConnectionStore((state) => state.createConversation);
  const isConnected = useConnectionStore((state) => state.isConnected);
  const setActiveConversation = useConversationStore((state) => state.setActiveConversation);
  const setRoute = useUrlStore((state) => state.setRoute);

  const handleReset = () => {
    setShowConfirm(true);
  };

  const confirmReset = () => {
    // Reset the game
    resetGame();
    // Create a new conversation and set it as active
    const newId = createConversation();
    if (newId) {
      setActiveConversation(newId);
      setRoute('chat', { conversationId: newId });
    }
    setShowConfirm(false);
  };

  return (
    <>
      <div className="game-controls">
        <button
          className="reset-button"
          onClick={handleReset}
          disabled={!isConnected}
          title="Reset to starting position"
          data-testid="reset-game-btn"
        >
          <svg
            className="reset-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span>New Game</span>
        </button>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="Start New Game"
        message="This will reset the board to the starting position and start a fresh conversation with the coach."
        confirmText="Start Fresh"
        cancelText="Cancel"
        onConfirm={confirmReset}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

