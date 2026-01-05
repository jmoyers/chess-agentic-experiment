import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useConversationStore } from '../../src/stores/conversationStore';
import type { ConversationMessage, StreamChunk } from '@chess/shared';

describe('ConversationStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useConversationStore.setState({
      conversations: [],
      activeConversationId: null,
      streamingMessage: null,
      isStreaming: false,
      error: null,
    });
  });

  describe('Initial State', () => {
    it('should start with empty conversations', () => {
      const state = useConversationStore.getState();
      expect(state.conversations).toEqual([]);
      expect(state.activeConversationId).toBeNull();
      expect(state.streamingMessage).toBeNull();
      expect(state.isStreaming).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('should create conversation if it does not exist', () => {
      const message: ConversationMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };

      useConversationStore.getState().addMessage(message);
      const state = useConversationStore.getState();

      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].id).toBe('conv-1');
      expect(state.conversations[0].messages).toHaveLength(1);
      expect(state.conversations[0].messages[0]).toEqual(message);
    });

    it('should set activeConversationId when adding first message', () => {
      const message: ConversationMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };

      useConversationStore.getState().addMessage(message);
      const state = useConversationStore.getState();

      expect(state.activeConversationId).toBe('conv-1');
    });

    it('should add message to existing conversation', () => {
      const msg1: ConversationMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };
      const msg2: ConversationMessage = {
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: Date.now(),
      };

      useConversationStore.getState().addMessage(msg1);
      useConversationStore.getState().addMessage(msg2);
      const state = useConversationStore.getState();

      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].messages).toHaveLength(2);
      expect(state.conversations[0].messages[1]).toEqual(msg2);
    });

    it('should NOT add duplicate message with same id', () => {
      const message: ConversationMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };

      useConversationStore.getState().addMessage(message);
      useConversationStore.getState().addMessage(message); // Duplicate
      const state = useConversationStore.getState();

      expect(state.conversations[0].messages).toHaveLength(1);
    });

    it('should handle messages with different ids but same content', () => {
      // Two messages with same content but different IDs are both valid
      // (e.g., user sends same message twice intentionally)
      const clientMsg: ConversationMessage = {
        id: 'user-123456',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };
      const clientMsg2: ConversationMessage = {
        id: 'user-789012',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };

      useConversationStore.getState().addMessage(clientMsg);
      useConversationStore.getState().addMessage(clientMsg2);
      const state = useConversationStore.getState();

      // Both messages with different IDs should be added
      expect(state.conversations[0].messages).toHaveLength(2);
    });
  });

  describe('addUserMessage', () => {
    it('should generate unique id for user message', () => {
      useConversationStore.getState().addUserMessage('conv-1', 'Hello');
      const state = useConversationStore.getState();

      expect(state.conversations[0].messages[0].id).toMatch(/^user-/);
      expect(state.conversations[0].messages[0].role).toBe('user');
      expect(state.conversations[0].messages[0].content).toBe('Hello');
    });

    it('should not create duplicate when called rapidly', async () => {
      // Simulate rapid message sending
      useConversationStore.getState().addUserMessage('conv-1', 'Message 1');
      await new Promise((r) => setTimeout(r, 1)); // Ensure different timestamps
      useConversationStore.getState().addUserMessage('conv-1', 'Message 2');
      const state = useConversationStore.getState();

      expect(state.conversations[0].messages).toHaveLength(2);
      expect(state.conversations[0].messages[0].content).toBe('Message 1');
      expect(state.conversations[0].messages[1].content).toBe('Message 2');
    });
  });

  describe('appendToStream', () => {
    it('should start new streaming message', () => {
      const chunk: StreamChunk = {
        conversationId: 'conv-1',
        messageId: 'stream-1',
        content: 'Hello',
        done: false,
      };

      useConversationStore.getState().appendToStream(chunk);
      const state = useConversationStore.getState();

      expect(state.isStreaming).toBe(true);
      expect(state.streamingMessage).toEqual({
        conversationId: 'conv-1',
        messageId: 'stream-1',
        content: 'Hello',
      });
    });

    it('should append to existing streaming message', () => {
      const chunk1: StreamChunk = {
        conversationId: 'conv-1',
        messageId: 'stream-1',
        content: 'Hello',
        done: false,
      };
      const chunk2: StreamChunk = {
        conversationId: 'conv-1',
        messageId: 'stream-1',
        content: ' World',
        done: false,
      };

      useConversationStore.getState().appendToStream(chunk1);
      useConversationStore.getState().appendToStream(chunk2);
      const state = useConversationStore.getState();

      expect(state.streamingMessage?.content).toBe('Hello World');
    });

    it('should mark streaming complete on done but preserve message for finalize', () => {
      const chunk1: StreamChunk = {
        conversationId: 'conv-1',
        messageId: 'stream-1',
        content: 'Hello',
        done: false,
      };
      const doneChunk: StreamChunk = {
        conversationId: 'conv-1',
        messageId: 'stream-1',
        content: '',
        done: true,
      };

      useConversationStore.getState().appendToStream(chunk1);
      useConversationStore.getState().appendToStream(doneChunk);
      const state = useConversationStore.getState();

      expect(state.isStreaming).toBe(false);
      // streamingMessage should be preserved for finalizeStream to save it
      expect(state.streamingMessage).not.toBeNull();
      expect(state.streamingMessage?.content).toBe('Hello');
    });

    it('should handle rapid chunks correctly', () => {
      const chunks = ['The ', 'quick ', 'brown ', 'fox'].map((content) => ({
        conversationId: 'conv-1',
        messageId: 'stream-1',
        content,
        done: false,
      }));

      for (const chunk of chunks) {
        useConversationStore.getState().appendToStream(chunk);
      }
      const state = useConversationStore.getState();

      expect(state.streamingMessage?.content).toBe('The quick brown fox');
    });
  });

  describe('finalizeStream', () => {
    it('should add streamed message to conversation', () => {
      // Setup: add user message and start streaming
      useConversationStore.getState().addUserMessage('conv-1', 'Hello');
      useConversationStore.getState().appendToStream({
        conversationId: 'conv-1',
        messageId: 'stream-1',
        content: 'Hi there!',
        done: false,
      });

      useConversationStore.getState().finalizeStream('conv-1');
      const state = useConversationStore.getState();

      expect(state.conversations[0].messages).toHaveLength(2);
      expect(state.conversations[0].messages[1].role).toBe('assistant');
      expect(state.conversations[0].messages[1].content).toBe('Hi there!');
      expect(state.isStreaming).toBe(false);
    });

    it('should not add message if stream was empty', () => {
      useConversationStore.getState().addUserMessage('conv-1', 'Hello');
      useConversationStore.getState().finalizeStream('conv-1');
      const state = useConversationStore.getState();

      // Should only have the user message
      expect(state.conversations[0].messages).toHaveLength(1);
    });

    it('should not add message if conversationId mismatch', () => {
      useConversationStore.getState().addUserMessage('conv-1', 'Hello');
      useConversationStore.getState().appendToStream({
        conversationId: 'conv-1',
        messageId: 'stream-1',
        content: 'Response',
        done: false,
      });
      useConversationStore.getState().finalizeStream('conv-2'); // Wrong ID
      const state = useConversationStore.getState();

      // Streaming should still be cleared but message not added
      expect(state.conversations[0].messages).toHaveLength(1);
      expect(state.streamingMessage).toBeNull();
    });
  });

  describe('setActiveConversation', () => {
    it('should set active conversation', () => {
      useConversationStore.getState().addUserMessage('conv-1', 'Hello');
      useConversationStore.getState().addUserMessage('conv-2', 'World');
      useConversationStore.getState().setActiveConversation('conv-2');
      const state = useConversationStore.getState();

      expect(state.activeConversationId).toBe('conv-2');
    });

    it('should allow setting to null', () => {
      useConversationStore.getState().addUserMessage('conv-1', 'Hello');
      useConversationStore.getState().setActiveConversation(null);
      const state = useConversationStore.getState();

      expect(state.activeConversationId).toBeNull();
    });
  });

  describe('removeConversation', () => {
    it('should remove conversation', () => {
      useConversationStore.getState().addUserMessage('conv-1', 'Hello');
      useConversationStore.getState().addUserMessage('conv-2', 'World');
      useConversationStore.getState().removeConversation('conv-1');
      const state = useConversationStore.getState();

      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].id).toBe('conv-2');
    });

    it('should clear activeConversationId if removed', () => {
      useConversationStore.getState().addUserMessage('conv-1', 'Hello');
      useConversationStore.getState().setActiveConversation('conv-1');
      useConversationStore.getState().removeConversation('conv-1');
      const state = useConversationStore.getState();

      expect(state.activeConversationId).toBeNull();
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      useConversationStore.getState().setError('Something went wrong');
      const state = useConversationStore.getState();

      expect(state.error).toBe('Something went wrong');
    });

    it('should auto-clear error after timeout', async () => {
      vi.useFakeTimers();
      useConversationStore.getState().setError('Error');

      vi.advanceTimersByTime(5000);
      const state = useConversationStore.getState();

      expect(state.error).toBeNull();
      vi.useRealTimers();
    });
  });

  describe('getActiveConversation', () => {
    it('should return active conversation', () => {
      useConversationStore.getState().addUserMessage('conv-1', 'Hello');
      const conversation = useConversationStore.getState().getActiveConversation();

      expect(conversation?.id).toBe('conv-1');
    });

    it('should return undefined if no active conversation', () => {
      const conversation = useConversationStore.getState().getActiveConversation();
      expect(conversation).toBeUndefined();
    });
  });

  describe('getMessages', () => {
    it('should return messages for conversation', () => {
      useConversationStore.getState().addUserMessage('conv-1', 'Hello');
      useConversationStore.getState().addUserMessage('conv-1', 'World');
      const messages = useConversationStore.getState().getMessages('conv-1');

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].content).toBe('World');
    });

    it('should return empty array for non-existent conversation', () => {
      const messages = useConversationStore.getState().getMessages('non-existent');
      expect(messages).toEqual([]);
    });
  });

  describe('Bug Scenarios (Fixed)', () => {
    describe('Duplicate user messages', () => {
      it('should deduplicate messages with same id', () => {
        // Client adds message optimistically
        const store = useConversationStore.getState();
        const msg: ConversationMessage = {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        };
        
        // Add same message twice (same ID)
        store.addMessage(msg);
        store.addMessage(msg);

        const state = useConversationStore.getState();
        // Should only have 1 message due to deduplication by ID
        expect(state.conversations[0].messages).toHaveLength(1);
      });
      
      it('should handle optimistic update pattern correctly', () => {
        // This tests the fixed pattern:
        // 1. Client adds user message locally (optimistic)
        // 2. Server does NOT echo back user messages
        // 3. Server only sends assistant response
        
        const store = useConversationStore.getState();
        
        // Client adds user message optimistically
        store.addUserMessage('conv-1', 'Hello');
        
        // Server sends assistant response (not user echo)
        const assistantMsg: ConversationMessage = {
          id: 'assistant-1',
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: Date.now(),
        };
        store.addMessage(assistantMsg);
        
        const state = useConversationStore.getState();
        expect(state.conversations[0].messages).toHaveLength(2);
        expect(state.conversations[0].messages[0].role).toBe('user');
        expect(state.conversations[0].messages[1].role).toBe('assistant');
      });
    });

    describe('Conversation creation timing', () => {
      it('should handle message sent before conversation is confirmed', () => {
        // This tests the race condition in AgentDrawer.handleSubmit
        // where createConversation is called, then 100ms later sendMessage is called
        
        // First: create conversation (server would emit conversation:message)
        const systemMsg: ConversationMessage = {
          id: 'system',
          conversationId: 'new-conv-id',
          role: 'assistant',
          content: 'New conversation started.',
          timestamp: Date.now(),
        };
        useConversationStore.getState().addMessage(systemMsg);

        // Then: user message is added
        useConversationStore.getState().addUserMessage('new-conv-id', 'Hello');

        const state = useConversationStore.getState();
        expect(state.conversations).toHaveLength(1);
        expect(state.conversations[0].messages).toHaveLength(2);
        expect(state.activeConversationId).toBe('new-conv-id');
      });

      it('should handle multiple system messages with same id', () => {
        // BUG: System message always has id 'system'
        // If user creates multiple conversations, they all have same id
        const systemMsg1: ConversationMessage = {
          id: 'system',
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'New conversation started.',
          timestamp: Date.now(),
        };
        const systemMsg2: ConversationMessage = {
          id: 'system',
          conversationId: 'conv-2',
          role: 'assistant',
          content: 'New conversation started.',
          timestamp: Date.now(),
        };

        useConversationStore.getState().addMessage(systemMsg1);
        useConversationStore.getState().addMessage(systemMsg2);

        const state = useConversationStore.getState();
        // Each conversation should have its system message
        expect(state.conversations).toHaveLength(2);
        expect(state.conversations[0].messages).toHaveLength(1);
        expect(state.conversations[1].messages).toHaveLength(1);
      });
    });

    describe('Streaming edge cases', () => {
      it('should handle stream interrupted by error', () => {
        useConversationStore.getState().addUserMessage('conv-1', 'Hello');
        useConversationStore.getState().appendToStream({
          conversationId: 'conv-1',
          messageId: 'stream-1',
          content: 'Partial response...',
          done: false,
        });
        
        // Error occurs during streaming
        useConversationStore.getState().setError('Connection lost');
        // Stream done without full response
        useConversationStore.getState().appendToStream({
          conversationId: 'conv-1',
          messageId: 'stream-1',
          content: '',
          done: true,
        });

        const state = useConversationStore.getState();
        expect(state.isStreaming).toBe(false);
        // streamingMessage preserved until finalizeStream, even on error
        expect(state.streamingMessage).not.toBeNull();
      });

      it('should handle new stream starting before previous ends', () => {
        // Start first stream
        useConversationStore.getState().appendToStream({
          conversationId: 'conv-1',
          messageId: 'stream-1',
          content: 'First response',
          done: false,
        });

        // New stream starts (different messageId)
        useConversationStore.getState().appendToStream({
          conversationId: 'conv-1',
          messageId: 'stream-2',
          content: 'Second response',
          done: false,
        });

        const state = useConversationStore.getState();
        // Should have replaced with new stream
        expect(state.streamingMessage?.messageId).toBe('stream-2');
        expect(state.streamingMessage?.content).toBe('Second response');
      });
    });
  });
});

