import { create } from 'zustand';
import type { Conversation, ConversationMessage, StreamChunk, ToolCallEvent, ThinkingEvent, PauseEvent, MultipleChoiceEvent, ReasoningModeEvent, ReasoningPhase } from '@chess/shared';

// Counter for generating unique message IDs within the same millisecond
let messageCounter = 0;
function generateMessageId(): string {
  return `user-${Date.now()}-${messageCounter++}`;
}

interface ToolCallState {
  toolName: string;
  status: 'calling' | 'complete';
  args?: Record<string, unknown>;
  result?: unknown;
}

interface ThinkingState {
  content: string;
  isActive: boolean;
  lastUpdatedAt: number;
}

interface PauseState {
  isPaused: boolean;
  pauseId: string | null;
  message: string | null;
}

interface MultipleChoiceState {
  isActive: boolean;
  questionId: string | null;
  question: string | null;
  options: string[];
}

interface ReasoningModeState {
  phase: ReasoningPhase | null;
  iteration: number;
  budgetTokens: number;
  maxIterations: number;
}

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  streamingMessage: {
    conversationId: string;
    messageId: string;
    content: string;
  } | null;
  isStreaming: boolean;
  thinking: ThinkingState;
  activeToolCall: ToolCallState | null;
  toolCallHistory: ToolCallState[];
  pause: PauseState;
  multipleChoice: MultipleChoiceState;
  reasoningMode: ReasoningModeState;
  error: string | null;
  
  // Actions
  addMessage: (message: ConversationMessage) => void;
  addUserMessage: (conversationId: string, content: string) => void;
  appendToStream: (chunk: StreamChunk) => void;
  finalizeStream: (conversationId: string) => void;
  setActiveConversation: (conversationId: string | null) => void;
  removeConversation: (conversationId: string) => void;
  setError: (error: string | null) => void;
  handleThinking: (event: ThinkingEvent) => void;
  handleToolCall: (event: ToolCallEvent) => void;
  handlePause: (event: PauseEvent) => void;
  clearPause: () => void;
  handleMultipleChoice: (event: MultipleChoiceEvent) => void;
  clearMultipleChoice: () => void;
  handleReasoningMode: (event: ReasoningModeEvent) => void;
  clearReasoningMode: () => void;
  clearAllPrompts: () => void;
  clearToolCallHistory: () => void;
  getActiveConversation: () => Conversation | undefined;
  getMessages: (conversationId: string) => ConversationMessage[];
  
  // Legacy compatibility
  isThinking: boolean;
  setThinking: (isThinking: boolean) => void;
  setToolCall: (toolCall: ToolCallEvent | null) => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  streamingMessage: null,
  isStreaming: false,
  thinking: { content: '', isActive: false, lastUpdatedAt: 0 },
  activeToolCall: null,
  toolCallHistory: [],
  pause: { isPaused: false, pauseId: null, message: null },
  multipleChoice: { isActive: false, questionId: null, question: null, options: [] },
  reasoningMode: { phase: null, iteration: 0, budgetTokens: 0, maxIterations: 0 },
  error: null,
  
  // Legacy compatibility getter
  get isThinking() {
    return get().thinking.isActive;
  },
  
  addMessage: (message) => {
    set((state) => {
      // Find or create conversation
      let conversation = state.conversations.find((c) => c.id === message.conversationId);
      
      if (!conversation) {
        conversation = {
          id: message.conversationId,
          title: `Conversation`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        };
        return {
          conversations: [...state.conversations, { ...conversation, messages: [message] }],
          activeConversationId: state.activeConversationId || message.conversationId,
        };
      }
      
      // Check if message already exists
      if (conversation.messages.some((m: { id: string }) => m.id === message.id)) {
        return state;
      }
      
      return {
        conversations: state.conversations.map((c) =>
          c.id === message.conversationId
            ? {
                ...c,
                messages: [...c.messages, message],
                updatedAt: Date.now(),
              }
            : c
        ),
        activeConversationId: state.activeConversationId || message.conversationId,
      };
    });
  },
  
  addUserMessage: (conversationId, content) => {
    const message: ConversationMessage = {
      id: generateMessageId(),
      conversationId,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    get().addMessage(message);
  },
  
  appendToStream: (chunk) => {
    set((state) => {
      if (chunk.done) {
        // Don't clear streamingMessage here - let finalizeStream handle it
        // Just mark streaming as complete
        return {
          isStreaming: false,
          isThinking: false,
          activeToolCall: null,
        };
      }
      
      const current = state.streamingMessage;
      if (current && current.messageId === chunk.messageId) {
        return {
          streamingMessage: {
            ...current,
            content: current.content + chunk.content,
          },
          isStreaming: true,
          isThinking: false, // Clear thinking when content arrives
        };
      }
      
      return {
        streamingMessage: {
          conversationId: chunk.conversationId,
          messageId: chunk.messageId,
          content: chunk.content,
        },
        isStreaming: true,
        isThinking: false, // Clear thinking when streaming starts
      };
    });
  },
  
  finalizeStream: (conversationId) => {
    set((state) => {
      const { streamingMessage } = state;
      if (!streamingMessage || streamingMessage.conversationId !== conversationId) {
        return { streamingMessage: null, isStreaming: false };
      }
      
      // Add the streamed message to the conversation
      const message: ConversationMessage = {
        id: streamingMessage.messageId,
        conversationId,
        role: 'assistant',
        content: streamingMessage.content,
        timestamp: Date.now(),
      };
      
      return {
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: [...c.messages, message],
                updatedAt: Date.now(),
              }
            : c
        ),
        streamingMessage: null,
        isStreaming: false,
      };
    });
  },
  
  setActiveConversation: (conversationId) => {
    set({ activeConversationId: conversationId });
  },
  
  removeConversation: (conversationId) => {
    set((state) => {
      const remaining = state.conversations.filter((c) => c.id !== conversationId);
      return {
        conversations: remaining,
        activeConversationId:
          state.activeConversationId === conversationId
            ? remaining[0]?.id || null
            : state.activeConversationId,
      };
    });
  },
  
  setError: (error) => {
    set({ error });
    if (error) {
      setTimeout(() => set({ error: null }), 5000);
    }
  },
  
  // Legacy setThinking for compatibility
  setThinking: (isThinking) => {
    set((state) => ({
      thinking: { ...state.thinking, isActive: isThinking, lastUpdatedAt: Date.now() },
      activeToolCall: isThinking ? null : state.activeToolCall,
    }));
  },
  
  // Legacy setToolCall for compatibility
  setToolCall: (toolCall) => {
    if (toolCall) {
      set((state) => ({
        activeToolCall: {
          toolName: toolCall.toolName,
          status: toolCall.status,
          args: toolCall.args,
          result: toolCall.result,
        },
        thinking: { ...state.thinking, isActive: false, lastUpdatedAt: Date.now() },
      }));
    } else {
      set({ activeToolCall: null });
    }
  },
  
  // New thinking handler with content
  handleThinking: (event) => {
    if (event.done) {
      set((state) => ({
        thinking: { content: state.thinking.content, isActive: false, lastUpdatedAt: Date.now() },
      }));
    } else {
      set((state) => ({
        thinking: {
          content: state.thinking.content + event.content,
          isActive: true,
          lastUpdatedAt: Date.now(),
        },
      }));
    }
  },
  
  // New tool call handler with args and results
  handleToolCall: (event) => {
    const toolState: ToolCallState = {
      toolName: event.toolName,
      status: event.status,
      args: event.args,
      result: event.result,
    };
    
    if (event.status === 'complete') {
      set((state) => ({
        activeToolCall: toolState,
        toolCallHistory: [...state.toolCallHistory, toolState],
        thinking: { ...state.thinking, isActive: false, lastUpdatedAt: Date.now() },
      }));
    } else {
      set((state) => ({
        activeToolCall: toolState,
        thinking: { ...state.thinking, isActive: false, lastUpdatedAt: Date.now() },
      }));
    }
  },
  
  clearToolCallHistory: () => {
    set({ toolCallHistory: [], thinking: { content: '', isActive: false, lastUpdatedAt: 0 } });
  },
  
  // Handle pause from agent
  handlePause: (event) => {
    set({
      pause: {
        isPaused: true,
        pauseId: event.pauseId,
        message: event.message || null,
      },
      activeToolCall: null,
      thinking: { content: '', isActive: false, lastUpdatedAt: 0 },
    });
  },
  
  // Clear pause state (when user continues)
  clearPause: () => {
    set({
      pause: { isPaused: false, pauseId: null, message: null },
    });
  },
  
  // Handle multiple choice from agent
  handleMultipleChoice: (event) => {
    set({
      multipleChoice: {
        isActive: true,
        questionId: event.questionId,
        question: event.question,
        options: event.options,
      },
      activeToolCall: null,
      thinking: { content: '', isActive: false, lastUpdatedAt: 0 },
    });
  },
  
  // Clear multiple choice state
  clearMultipleChoice: () => {
    set({
      multipleChoice: { isActive: false, questionId: null, question: null, options: [] },
    });
  },
  
  // Handle reasoning mode updates from server
  handleReasoningMode: (event) => {
    set({
      reasoningMode: {
        phase: event.phase,
        iteration: event.iteration,
        budgetTokens: event.budgetTokens,
        maxIterations: event.maxIterations,
      },
    });
  },
  
  // Clear reasoning mode state (when conversation ends)
  clearReasoningMode: () => {
    set({
      reasoningMode: { phase: null, iteration: 0, budgetTokens: 0, maxIterations: 0 },
    });
  },
  
  // Clear all prompts (pause and multiple choice) - useful when user sends new message
  clearAllPrompts: () => {
    set({
      pause: { isPaused: false, pauseId: null, message: null },
      multipleChoice: { isActive: false, questionId: null, question: null, options: [] },
    });
  },
  
  getActiveConversation: () => {
    const state = get();
    return state.conversations.find((c) => c.id === state.activeConversationId);
  },
  
  getMessages: (conversationId) => {
    const conversation = get().conversations.find((c) => c.id === conversationId);
    return conversation?.messages || [];
  },
}));

