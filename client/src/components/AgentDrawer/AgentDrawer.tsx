import { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConversationStore } from '../../stores/conversationStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useUrlStore } from '../../stores/urlStore';
import { useOpeningStore } from '../../stores/openingStore';
import { ConversationSelector } from '../ConversationSelector/ConversationSelector';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import './AgentDrawer.css';

interface QuickAction {
  label: string;
  icon: string;
  prompt: string;
}

// Format tool names for display
function formatToolName(toolName: string): string {
  const toolLabels: Record<string, string> = {
    // Information tools (no board change)
    lookup_opening: 'Looking up opening',
    list_openings: 'Listing openings',
    get_position_stats: 'Getting statistics',
    get_current_position: 'Checking position',
    // Board manipulation
    reset_board: 'Resetting board',
    make_move: 'Making move',
    make_moves: 'Playing moves',
    undo_moves: 'Rewinding',
    goto_move: 'Navigating to move',
    set_position: 'Setting position',
    // Annotations
    draw_arrows: 'Drawing arrows',
    highlight_squares: 'Highlighting squares',
    clear_annotations: 'Clearing board',
    // Analysis
    analyze_position: 'Analyzing position',
    // Teaching flow
    ask_multiple_choice: 'Asking question',
  };
  return toolLabels[toolName] || toolName.replace(/_/g, ' ');
}

// Format tool arguments for display
function formatToolArgs(args?: Record<string, unknown>): string {
  if (!args) return '';
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  
  // Helper to extract string from potential object wrappers (Gemini sends {text}, others {value}/{description})
  const extractValue = (val: unknown): string => {
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null) {
      if ('text' in val) return String((val as { text: unknown }).text);
      if ('value' in val) return String((val as { value: unknown }).value);
      if ('description' in val) return String((val as { description: unknown }).description);
    }
    return JSON.stringify(val);
  };
  
  return entries
    .map(([key, value]) => {
      const formattedValue = typeof value === 'string' 
        ? value 
        : Array.isArray(value) 
          ? value.map(extractValue).join(', ')
          : extractValue(value);
      return `${key}: ${formattedValue}`;
    })
    .slice(0, 3) // Only show first 3 args
    .join(' • ');
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Best move?',
    icon: '🎯',
    prompt: "What's the most common or best move in this position? Explain why.",
  },
  {
    label: 'Position themes',
    icon: '💡',
    prompt: "What are the main themes and ideas in this position? What should each side be trying to achieve?",
  },
  {
    label: 'Attacking plans',
    icon: '⚔️',
    prompt: "What are the main attacking plans and ideas in this position? Show me the key squares and pieces involved.",
  },
  {
    label: 'Defense tips',
    icon: '🛡️',
    prompt: "What are the key defensive considerations here? What should I watch out for?",
  },
  {
    label: 'Key tactics',
    icon: '♟️',
    prompt: "What tactical motifs should I look for in this position? Are there any immediate threats or combinations?",
  },
];

// Time after which reasoning content starts to fade (ms)
const REASONING_FADE_DELAY = 5000;
// Time for the fade animation (ms)
const REASONING_FADE_DURATION = 2000;

export function AgentDrawer() {
  const [input, setInput] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showToolHistory, setShowToolHistory] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [reasoningOpacity, setReasoningOpacity] = useState(1);
  const [showNewConversationConfirm, setShowNewConversationConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);

  // URL state for drawer
  const isOpen = useUrlStore((state) => state.drawerOpen);
  const drawerWidth = useUrlStore((state) => state.drawerWidth);
  const setDrawerOpen = useUrlStore((state) => state.setDrawerOpen);
  const setDrawerWidth = useUrlStore((state) => state.setDrawerWidth);
  const setRoute = useUrlStore((state) => state.setRoute);
  const setUrlModelId = useUrlStore((state) => state.setModelId);
  const setUrlThinking = useUrlStore((state) => state.setThinking);
  const setUrlWebSearch = useUrlStore((state) => state.setWebSearch);

  // Handle drag resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      // Clamp between min and max
      const minWidth = 320;
      const maxWidth = window.innerWidth * 0.7;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setDrawerWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setDrawerWidth]);

  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const conversations = useConversationStore((state) => state.conversations);
  const streamingMessage = useConversationStore((state) => state.streamingMessage);
  const isStreaming = useConversationStore((state) => state.isStreaming);
  const thinking = useConversationStore((state) => state.thinking);
  const activeToolCall = useConversationStore((state) => state.activeToolCall);
  const toolCallHistory = useConversationStore((state) => state.toolCallHistory);
  const multipleChoice = useConversationStore((state) => state.multipleChoice);
  const reasoningMode = useConversationStore((state) => state.reasoningMode);
  const error = useConversationStore((state) => state.error);

  const sendMessage = useConnectionStore((state) => state.sendMessage);
  const createConversation = useConnectionStore((state) => state.createConversation);
  const isConnected = useConnectionStore((state) => state.isConnected);
  const currentModelId = useConnectionStore((state) => state.currentModelId);
  const selectModel = useConnectionStore((state) => state.selectModel);
  const agentSettings = useConnectionStore((state) => state.agentSettings);
  const setThinkingEnabled = useConnectionStore((state) => state.setThinkingEnabled);
  const setWebSearchEnabled = useConnectionStore((state) => state.setWebSearchEnabled);
  const setPromptStyle = useConnectionStore((state) => state.setPromptStyle);
  const answerMultipleChoice = useConnectionStore((state) => state.answerMultipleChoice);
  const dismissPrompt = useConnectionStore((state) => state.dismissPrompt);
  const stopConversation = useConnectionStore((state) => state.stopConversation);

  // Current opening from the opening store
  const currentOpening = useOpeningStore((state) => state.currentOpening);
  
  // Dynamic quick actions based on current opening
  const dynamicQuickActions = useMemo(() => {
    const actions = [...QUICK_ACTIONS.slice(0, 3)];
    
    if (currentOpening) {
      // Add "Explain this opening" as the first action when an opening is loaded
      return [
        {
          label: `Explain ${currentOpening.name.split(':')[0]}`,
          icon: '📚',
          prompt: `Please explain the ${currentOpening.name}.`,
        },
        ...actions.slice(0, 2), // Show only 2 other actions to fit
      ];
    }
    
    return actions;
  }, [currentOpening]);

  // Model display info
  const modelDisplayName = currentModelId === 'claude-opus-4.5' 
    ? 'Opus 4.5' 
    : currentModelId === 'chatgpt-5.2' 
      ? 'GPT 5.2' 
      : currentModelId === 'gemini-3-pro'
        ? 'Gemini 3'
        : 'Sonnet 4';

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, thinking, activeToolCall, toolCallHistory]);

  // Auto-scroll reasoning content to bottom when new content arrives
  useLayoutEffect(() => {
    if (reasoningRef.current && thinking.content) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [thinking.content]);

  // Auto-fade reasoning content after it becomes inactive
  useEffect(() => {
    if (thinking.isActive) {
      // Reset opacity when actively thinking
      setReasoningOpacity(1);
      return;
    }

    // If not active but has content, start fade timer
    if (thinking.content && thinking.lastUpdatedAt > 0) {
      const timeSinceUpdate = Date.now() - thinking.lastUpdatedAt;
      const remainingDelay = Math.max(0, REASONING_FADE_DELAY - timeSinceUpdate);

      const fadeStartTimer = setTimeout(() => {
        // Start fading
        const fadeSteps = 20;
        const stepDuration = REASONING_FADE_DURATION / fadeSteps;
        let step = 0;

        const fadeInterval = setInterval(() => {
          step++;
          setReasoningOpacity(1 - (step / fadeSteps));
          if (step >= fadeSteps) {
            clearInterval(fadeInterval);
          }
        }, stepDuration);

        return () => clearInterval(fadeInterval);
      }, remainingDelay);

      return () => clearTimeout(fadeStartTimer);
    }
  }, [thinking.isActive, thinking.lastUpdatedAt, thinking.content]);

  // Keyboard shortcuts for multiple choice (1,2,3...)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      
      // Number keys to answer multiple choice (1-5)
      if (multipleChoice.isActive && multipleChoice.questionId) {
        const keyNum = parseInt(e.key);
        if (keyNum >= 1 && keyNum <= multipleChoice.options.length) {
          e.preventDefault();
          answerMultipleChoice(multipleChoice.questionId, keyNum - 1);
          return;
        }
        // Escape to dismiss
        if (e.code === 'Escape') {
          e.preventDefault();
          dismissPrompt(multipleChoice.questionId);
          return;
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [multipleChoice.isActive, multipleChoice.questionId, multipleChoice.options.length, answerMultipleChoice, dismissPrompt]);

  const handleOpenDrawer = useCallback(() => {
    setDrawerOpen(true);
  }, [setDrawerOpen]);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  // Handle new conversation - show confirm if there are messages
  const handleNewConversation = useCallback(() => {
    if (messages.length > 0) {
      setShowNewConversationConfirm(true);
    } else {
      // No messages, just create new conversation directly
      const newId = createConversation();
      if (newId) {
        setRoute('chat', { conversationId: newId });
      }
    }
  }, [messages.length, createConversation, setRoute]);

  const confirmNewConversation = useCallback(() => {
    const newId = createConversation();
    if (newId) {
      setRoute('chat', { conversationId: newId });
    }
    setShowNewConversationConfirm(false);
  }, [createConversation, setRoute]);

  const sendQuickAction = useCallback((prompt: string) => {
    if (!isConnected || isStreaming) return;

    if (!activeConversationId) {
      const newId = createConversation();
      if (newId) {
        // Update URL with new conversation
        setRoute('chat', { conversationId: newId });
        sendMessage(newId, prompt);
      }
    } else {
      sendMessage(activeConversationId, prompt);
    }
  }, [activeConversationId, createConversation, isConnected, isStreaming, sendMessage, setRoute]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Allow sending when multiple choice is active (to interrupt with a different question)
    if (!input.trim() || !isConnected || (isStreaming && !multipleChoice.isActive)) return;

    const trimmedInput = input.trim();
    setInput('');

    if (!activeConversationId) {
      // Create conversation and send message with the new ID
      const newId = createConversation();
      if (newId) {
        // Update URL with new conversation
        setRoute('chat', { conversationId: newId });
        sendMessage(newId, trimmedInput);
      }
    } else {
      sendMessage(activeConversationId, trimmedInput);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleStop = useCallback(() => {
    if (activeConversationId && isStreaming) {
      stopConversation(activeConversationId);
    }
  }, [activeConversationId, isStreaming, stopConversation]);

  return (
    <>
      {/* Toggle button */}
      <button
        className={`drawer-toggle ${isOpen ? 'open' : ''}`}
        onClick={handleOpenDrawer}
        title="Chat with AI coach"
        data-testid="drawer-toggle"
      >
        <span className="toggle-icon">💬</span>
        {!isOpen && messages.length > 0 && (
          <span className="message-badge">{messages.length}</span>
        )}
      </button>

      {/* Drawer - now positioned fixed on the right, pushes content */}
      <div 
        ref={drawerRef}
        className={`agent-drawer ${isOpen ? 'open' : ''} ${isResizing ? 'resizing' : ''}`}
        style={{ width: drawerWidth }}
        data-testid="agent-drawer"
      >
        {/* Resize handle */}
        <div 
          className={`drawer-resize-handle ${isResizing ? 'dragging' : ''}`}
          onMouseDown={handleResizeStart}
          data-testid="drawer-resize-handle"
        />
        
        <div className="drawer-header">
          <div className="header-left">
            <h2>Chess Coach</h2>
            <button
              className="conversation-toggle"
              onClick={() => setShowSelector(!showSelector)}
              title="Conversation history"
              data-testid="conversation-toggle"
            >
              {showSelector ? '×' : '≡'}
            </button>
            <button
              className="new-conversation-btn"
              onClick={handleNewConversation}
              title="Start new conversation"
              data-testid="new-conversation-btn"
              disabled={!isConnected}
            >
              <span className="new-conv-icon">+</span>
            </button>
          </div>
          <div className="header-right">
            {/* Model selector */}
            <div className="model-selector-container">
              <button
                className={`model-selector-btn ${showModelSelector ? 'active' : ''}`}
                onClick={() => setShowModelSelector(!showModelSelector)}
                title="AI settings"
                data-testid="model-selector"
              >
                <span className="model-icon">🤖</span>
                <span className="model-name">{modelDisplayName}</span>
                {(agentSettings.thinking || agentSettings.webSearch) && (
                  <span className="settings-indicator">+</span>
                )}
                <span className="model-chevron">▾</span>
              </button>
              {showModelSelector && (
                <div className="model-dropdown" data-testid="model-dropdown">
                  <div className="dropdown-section">
                    <div className="dropdown-section-label">Model</div>
                    <button
                      className={`model-option ${currentModelId === 'claude-sonnet-4' ? 'selected' : ''}`}
                      onClick={() => {
                        selectModel('claude-sonnet-4');
                        setUrlModelId('claude-sonnet-4');
                        setShowModelSelector(false);
                      }}
                      data-testid="model-option-sonnet"
                    >
                      <span className="option-name">Claude Sonnet 4</span>
                      <span className="option-desc">Fast & efficient</span>
                    </button>
                    <button
                      className={`model-option ${currentModelId === 'claude-opus-4.5' ? 'selected' : ''}`}
                      onClick={() => {
                        selectModel('claude-opus-4.5');
                        setUrlModelId('claude-opus-4.5');
                        setShowModelSelector(false);
                      }}
                      data-testid="model-option-opus"
                    >
                      <span className="option-name">Claude Opus 4.5</span>
                      <span className="option-desc">Most capable</span>
                    </button>
                    <button
                      className={`model-option ${currentModelId === 'chatgpt-5.2' ? 'selected' : ''}`}
                      onClick={() => {
                        selectModel('chatgpt-5.2');
                        setUrlModelId('chatgpt-5.2');
                        setShowModelSelector(false);
                      }}
                      data-testid="model-option-chatgpt"
                    >
                      <span className="option-name">ChatGPT 5.2</span>
                      <span className="option-desc">OpenAI's latest</span>
                    </button>
                    <button
                      className={`model-option ${currentModelId === 'gemini-3-pro' ? 'selected' : ''}`}
                      onClick={() => {
                        selectModel('gemini-3-pro');
                        setUrlModelId('gemini-3-pro');
                        setShowModelSelector(false);
                      }}
                      data-testid="model-option-gemini"
                    >
                      <span className="option-name">Gemini 3 Pro</span>
                      <span className="option-desc">Google's most intelligent</span>
                    </button>
                  </div>
                  <div className="dropdown-section">
                    <div className="dropdown-section-label">Teaching Style</div>
                    <button
                      className={`model-option ${agentSettings.promptStyle === 'detailed' ? 'selected' : ''}`}
                      onClick={() => setPromptStyle('detailed')}
                      data-testid="prompt-option-detailed"
                    >
                      <span className="option-name">Detailed</span>
                      <span className="option-desc">Thorough explanations</span>
                    </button>
                    <button
                      className={`model-option ${agentSettings.promptStyle === 'terse' ? 'selected' : ''}`}
                      onClick={() => setPromptStyle('terse')}
                      data-testid="prompt-option-terse"
                    >
                      <span className="option-name">Principles</span>
                      <span className="option-desc">Brief themes & plans</span>
                    </button>
                  </div>
                  <div className="dropdown-section">
                    <div className="dropdown-section-label">Features</div>
                    <label className="toggle-option" data-testid="thinking-toggle">
                      <span className="toggle-info">
                        <span className="toggle-name">Extended Thinking</span>
                        <span className="toggle-desc">Deeper reasoning</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={agentSettings.thinking}
                        onChange={(e) => {
                          setThinkingEnabled(e.target.checked);
                          setUrlThinking(e.target.checked);
                        }}
                      />
                      <span className="toggle-switch" />
                    </label>
                    <label className="toggle-option" data-testid="websearch-toggle">
                      <span className="toggle-info">
                        <span className="toggle-name">Web Search</span>
                        <span className="toggle-desc">Real-time info</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={agentSettings.webSearch}
                        onChange={(e) => {
                          setWebSearchEnabled(e.target.checked);
                          setUrlWebSearch(e.target.checked);
                        }}
                      />
                      <span className="toggle-switch" />
                    </label>
                  </div>
                </div>
              )}
            </div>
            <button 
              className="close-drawer" 
              onClick={handleCloseDrawer}
              data-testid="close-drawer"
            >
              ×
            </button>
          </div>
        </div>

        {showSelector && (
          <ConversationSelector onClose={() => setShowSelector(false)} />
        )}

        <div className="messages-container" data-testid="messages-container">
          {messages.length === 0 && !streamingMessage && (
            <div className="empty-state">
              <p>Ask me about openings, positions, or chess strategy.</p>
              <p className="hint">I can explain themes, suggest moves, and help you understand plans for both sides.</p>
              <div className="quick-actions-grid">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    className="quick-action-btn"
                    onClick={() => sendQuickAction(action.prompt)}
                    disabled={!isConnected || isStreaming}
                  >
                    <span className="quick-action-icon">{action.icon}</span>
                    <span className="quick-action-label">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg: { id: string; role: string; content: string }) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-content">
                {msg.role === 'assistant' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {streamingMessage && (
            <div className="message assistant streaming">
              <div className="message-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingMessage.content}</ReactMarkdown>
                <span className="cursor">▊</span>
              </div>
            </div>
          )}

          {/* Unified agent activity display - combines reasoning, tools, and progress */}
          {(reasoningMode.phase || thinking.isActive || (thinking.content && reasoningOpacity > 0) || toolCallHistory.length > 0 || (activeToolCall && activeToolCall.status === 'calling')) && (
            <div 
              className={`agent-activity-display ${thinking.isActive ? 'active' : ''} ${!thinking.isActive && thinking.content ? 'fading' : ''}`}
              style={{ opacity: thinking.isActive || reasoningMode.phase || activeToolCall?.status === 'calling' ? 1 : reasoningOpacity }}
              data-testid="agent-activity-display"
            >
              {/* Header with phase, tokens, iteration */}
              <div className="activity-header">
                {reasoningMode.phase ? (
                  <>
                    <span className={`phase-icon ${reasoningMode.phase}`}>
                      {reasoningMode.phase === 'planning' ? '🎯' : '⚡'}
                    </span>
                    <span className="phase-label">
                      {reasoningMode.phase === 'planning' ? 'Planning' : 'Executing'}
                    </span>
                    <span className="activity-meta">
                      {Math.round(reasoningMode.budgetTokens / 1000)}k tokens
                    </span>
                    <span className="activity-meta">
                      {reasoningMode.iteration}/{reasoningMode.maxIterations}
                    </span>
                  </>
                ) : thinking.isActive ? (
                  <>
                    <span className="reasoning-indicator">
                      <span className="reasoning-dot" />
                    </span>
                    <span className="phase-label">Thinking</span>
                  </>
                ) : (activeToolCall && activeToolCall.status === 'calling') ? (
                  <>
                    <span className="phase-icon executing">⚡</span>
                    <span className="phase-label">Working</span>
                  </>
                ) : null}
              </div>

              {/* Reasoning content */}
              {thinking.content && (
                <div className="reasoning-content" ref={reasoningRef}>
                  {thinking.content}
                </div>
              )}

              {/* Active tool call */}
              {activeToolCall && activeToolCall.status === 'calling' && (
                <div className="activity-tool-call">
                  <span className="tool-icon spinning">⚙️</span>
                  <span className="tool-name">{formatToolName(activeToolCall.toolName)}</span>
                  {activeToolCall.args && (
                    <span className="tool-args-inline">{formatToolArgs(activeToolCall.args)}</span>
                  )}
                </div>
              )}

              {/* Completed tool calls */}
              {toolCallHistory.length > 0 && (
                <div className="activity-completed">
                  {toolCallHistory.length === 1 ? (
                    <div className="completed-tool">
                      <span className="tool-icon">✓</span>
                      <span className="tool-name">{formatToolName(toolCallHistory[0].toolName)}</span>
                    </div>
                  ) : (
                    <button 
                      className="completed-toggle"
                      onClick={() => setShowToolHistory(!showToolHistory)}
                    >
                      <span className="tool-icon">✓</span>
                      <span className="completed-summary">
                        {toolCallHistory.length} actions completed
                      </span>
                      <span className={`toggle-chevron ${showToolHistory ? 'open' : ''}`}>▾</span>
                    </button>
                  )}
                  {showToolHistory && toolCallHistory.length > 1 && (
                    <div className="completed-list">
                      {toolCallHistory.map((tc, index) => (
                        <div key={index} className="completed-tool nested">
                          <span className="tool-icon">✓</span>
                          <span className="tool-name">{formatToolName(tc.toolName)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Multiple choice question indicator */}
          {multipleChoice.isActive && multipleChoice.questionId && (
            <div className="multiple-choice-indicator" data-testid="multiple-choice-indicator">
              <div className="mc-header">
                <span className="mc-icon">❓</span>
                <span className="mc-question">{typeof multipleChoice.question === 'string' ? multipleChoice.question : String(multipleChoice.question)}</span>
                <button
                  className="dismiss-btn"
                  onClick={() => dismissPrompt(multipleChoice.questionId!)}
                  data-testid="dismiss-mc-button"
                  title="Dismiss (Esc)"
                >
                  ×
                </button>
              </div>
              <div className="mc-options">
                {multipleChoice.options.map((option, index) => {
                  // Defensive: handle if option is an object instead of string
                  // Gemini sends {text: "..."}, others may send {value: "..."} or {description: "..."}
                  const optionText = typeof option === 'string' 
                    ? option 
                    : typeof option === 'object' && option !== null
                      ? ('text' in option ? String((option as { text: unknown }).text) 
                        : 'value' in option ? String((option as { value: unknown }).value) 
                        : JSON.stringify(option))
                      : String(option);
                  return (
                    <button
                      key={index}
                      className="mc-option-btn"
                      onClick={() => answerMultipleChoice(multipleChoice.questionId!, index)}
                      data-testid={`mc-option-${index}`}
                    >
                      <span className="mc-key">{index + 1}</span>
                      <span className="mc-text">{optionText}</span>
                    </button>
                  );
                })}
              </div>
              <span className="prompt-hint">press 1-{multipleChoice.options.length} to answer, Esc to dismiss, or type a new question</span>
            </div>
          )}

          {error && (
            <div className="message error">
              <p>{error}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick actions row - always visible */}
        <div className="quick-actions-row">
          {dynamicQuickActions.map((action, index) => (
            <button
              key={action.label}
              className={`quick-action-chip ${index === 0 && currentOpening ? 'highlight' : ''}`}
              onClick={() => sendQuickAction(action.prompt)}
              disabled={!isConnected || isStreaming}
              title={action.prompt}
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>

        <form className="input-form" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={multipleChoice.isActive ? "Type to ask something else..." : "Ask about this position..."}
            disabled={!isConnected || (isStreaming && !multipleChoice.isActive)}
            rows={2}
          />
          <div className="input-buttons">
            {isStreaming && !multipleChoice.isActive ? (
              <button
                type="button"
                className="stop-btn"
                onClick={handleStop}
                title="Stop generating"
                data-testid="stop-btn"
              >
                <span className="stop-icon">◼</span>
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || !isConnected}
                data-testid="send-btn"
              >
                Send
              </button>
            )}
          </div>
        </form>
      </div>

      {/* New Conversation Confirm Modal */}
      <ConfirmModal
        isOpen={showNewConversationConfirm}
        title="Start New Conversation"
        message="Starting a new conversation will clear your current chat. Your previous conversations will still be available in the history."
        confirmText="Start New"
        cancelText="Cancel"
        onConfirm={confirmNewConversation}
        onCancel={() => setShowNewConversationConfirm(false)}
      />
    </>
  );
}
