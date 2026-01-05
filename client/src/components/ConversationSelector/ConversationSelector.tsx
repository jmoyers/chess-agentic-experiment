import { useState } from 'react';
import { useConversationStore } from '../../stores/conversationStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useUrlStore } from '../../stores/urlStore';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import './ConversationSelector.css';

interface ConversationSelectorProps {
  onClose: () => void;
}

export function ConversationSelector({ onClose }: ConversationSelectorProps) {
  const [showNewConfirm, setShowNewConfirm] = useState(false);
  const conversations = useConversationStore((state) => state.conversations);
  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const setActiveConversation = useConversationStore((state) => state.setActiveConversation);
  
  const createConversation = useConnectionStore((state) => state.createConversation);
  const selectConversation = useConnectionStore((state) => state.selectConversation);
  const deleteConversation = useConnectionStore((state) => state.deleteConversation);
  const setRoute = useUrlStore((state) => state.setRoute);

  // Get current active conversation messages count
  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const hasMessages = activeConversation && activeConversation.messages.length > 0;

  const handleSelect = (id: string) => {
    // Set local state
    setActiveConversation(id);
    // Tell server to load this conversation (for message recall)
    selectConversation(id);
    // Update URL
    setRoute('chat', { conversationId: id });
    onClose();
  };

  const handleNew = () => {
    if (hasMessages) {
      setShowNewConfirm(true);
    } else {
      performNewConversation();
    }
  };

  const performNewConversation = () => {
    const newId = createConversation();
    if (newId) {
      setRoute('chat', { conversationId: newId });
    }
    setShowNewConfirm(false);
    onClose();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteConversation(id);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getPreview = (messages: { content: string; role: string }[]) => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      const preview = lastUserMsg.content.slice(0, 50);
      return preview.length < lastUserMsg.content.length ? `${preview}...` : preview;
    }
    return 'New conversation';
  };

  return (
    <>
      <div className="conversation-selector">
        <button className="new-conversation" onClick={handleNew} data-testid="selector-new-conversation">
          <span className="plus">+</span>
          <span>New Conversation</span>
        </button>

        <div className="conversation-list">
          {conversations.length === 0 ? (
            <div className="no-conversations">
              <p>No conversations yet</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
                onClick={() => handleSelect(conv.id)}
                data-testid={`conversation-item-${conv.id}`}
              >
                <div className="conversation-info">
                  <span className="conversation-preview">{getPreview(conv.messages)}</span>
                  <span className="conversation-date">{formatDate(conv.updatedAt)}</span>
                </div>
                <button
                  className="delete-btn"
                  onClick={(e) => handleDelete(e, conv.id)}
                  title="Delete conversation"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showNewConfirm}
        title="Start New Conversation"
        message="Starting a new conversation will clear your current chat. Your previous conversations will still be available in the history."
        confirmText="Start New"
        cancelText="Cancel"
        onConfirm={performNewConversation}
        onCancel={() => setShowNewConfirm(false)}
      />
    </>
  );
}

