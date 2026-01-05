/**
 * Comprehensive state machine tests for conversation flow.
 * These tests simulate the exact sequence of events that occur
 * when a user sends a message and receives responses.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useConversationStore } from '../../src/stores/conversationStore';
import type { ConversationMessage, StreamChunk } from '@chess/shared';

describe('Conversation State Machine', () => {
  beforeEach(() => {
    useConversationStore.setState({
      conversations: [],
      activeConversationId: null,
      streamingMessage: null,
      isStreaming: false,
      error: null,
    });
  });

  describe('New Conversation Flow', () => {
    const conversationId = 'conv-test-123';

    it('FLOW 1: Client adds message BEFORE server system message arrives', () => {
      const store = useConversationStore.getState();

      // Step 1: Client creates conversation and adds user message locally
      store.addUserMessage(conversationId, 'Hello, chess coach!');

      // Verify: Conversation exists with user message, is active
      let state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.activeConversationId).toBe(conversationId);
      expect(state.conversations[0].messages).toHaveLength(1);
      expect(state.conversations[0].messages[0].role).toBe('user');
      expect(state.conversations[0].messages[0].content).toBe('Hello, chess coach!');

      // Step 2: Server system message arrives
      const systemMsg: ConversationMessage = {
        id: `system-${conversationId}`,
        conversationId,
        role: 'assistant',
        content: 'New conversation started.',
        timestamp: Date.now(),
      };
      store.addMessage(systemMsg);

      // Verify: System message added to existing conversation
      state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].messages).toHaveLength(2);
      // System message should be added (order depends on timing)

      // Step 3: AI starts streaming response
      store.appendToStream({
        conversationId,
        messageId: 'response-1',
        content: 'Hello! ',
        done: false,
      });

      state = useConversationStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingMessage?.content).toBe('Hello! ');

      // Step 4: More streaming content
      store.appendToStream({
        conversationId,
        messageId: 'response-1',
        content: 'I am your chess coach.',
        done: false,
      });

      state = useConversationStore.getState();
      expect(state.streamingMessage?.content).toBe('Hello! I am your chess coach.');

      // Step 5: Stream ends
      store.appendToStream({
        conversationId,
        messageId: 'response-1',
        content: '',
        done: true,
      });

      state = useConversationStore.getState();
      expect(state.isStreaming).toBe(false);
      // streamingMessage is preserved until finalizeStream is called
      expect(state.streamingMessage).not.toBeNull();

      // Step 6: Finalize stream (adds to messages)
      store.finalizeStream(conversationId);

      // Final state: Conversation should have all messages
      state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.activeConversationId).toBe(conversationId);
      expect(state.streamingMessage).toBeNull();
      // Now the assistant message should be in the conversation
      expect(state.conversations[0].messages.length).toBeGreaterThanOrEqual(2);
    });

    it('FLOW 2: Server system message arrives BEFORE client adds user message', () => {
      const store = useConversationStore.getState();

      // Step 1: Server system message arrives first (race condition)
      const systemMsg: ConversationMessage = {
        id: `system-${conversationId}`,
        conversationId,
        role: 'assistant',
        content: 'New conversation started.',
        timestamp: Date.now(),
      };
      store.addMessage(systemMsg);

      // Verify: Conversation created with system message
      let state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.activeConversationId).toBe(conversationId);
      expect(state.conversations[0].messages).toHaveLength(1);

      // Step 2: Client adds user message
      store.addUserMessage(conversationId, 'Hello, chess coach!');

      // Verify: User message added to existing conversation
      state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].messages).toHaveLength(2);
      expect(state.activeConversationId).toBe(conversationId);
    });

    it('FLOW 3: Full conversation with multiple messages', () => {
      const store = useConversationStore.getState();

      // User sends first message
      store.addUserMessage(conversationId, 'What is the Italian Game?');

      // System message
      store.addMessage({
        id: `system-${conversationId}`,
        conversationId,
        role: 'assistant',
        content: 'Welcome!',
        timestamp: Date.now(),
      });

      // AI response streams
      store.appendToStream({
        conversationId,
        messageId: 'resp-1',
        content: 'The Italian Game is a chess opening.',
        done: false,
      });
      store.appendToStream({
        conversationId,
        messageId: 'resp-1',
        content: '',
        done: true,
      });

      // Before finalizing, manually add the assistant message
      // (simulating what the server does via conversation:message)
      store.addMessage({
        id: 'resp-1',
        conversationId,
        role: 'assistant',
        content: 'The Italian Game is a chess opening.',
        timestamp: Date.now(),
      });

      let state = useConversationStore.getState();
      expect(state.conversations[0].messages.length).toBeGreaterThanOrEqual(3);

      // User sends second message
      store.addUserMessage(conversationId, 'Show me the main line.');

      state = useConversationStore.getState();
      const userMessages = state.conversations[0].messages.filter(m => m.role === 'user');
      expect(userMessages).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle stream without prior conversation', () => {
      const store = useConversationStore.getState();
      const conversationId = 'new-conv';

      // Stream arrives but no conversation exists yet
      store.appendToStream({
        conversationId,
        messageId: 'msg-1',
        content: 'Hello',
        done: false,
      });

      // Streaming should work even without conversation
      const state = useConversationStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingMessage?.content).toBe('Hello');
    });

    it('should handle finalize for non-existent conversation gracefully', () => {
      const store = useConversationStore.getState();

      // Create a conversation and start streaming
      store.addUserMessage('conv-1', 'Test');
      store.appendToStream({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: 'Response',
        done: false,
      });

      // Try to finalize for wrong conversation
      store.finalizeStream('wrong-conv');

      // Should clear streaming but not crash
      const state = useConversationStore.getState();
      expect(state.streamingMessage).toBeNull();
    });

    it('should handle rapid message sending', () => {
      const store = useConversationStore.getState();
      const conversationId = 'conv-rapid';

      // Rapid fire messages
      store.addUserMessage(conversationId, 'Message 1');
      store.addUserMessage(conversationId, 'Message 2');
      store.addUserMessage(conversationId, 'Message 3');

      const state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].messages).toHaveLength(3);
    });

    it('should maintain activeConversationId through multiple operations', () => {
      const store = useConversationStore.getState();

      // Create first conversation
      store.addUserMessage('conv-1', 'First');
      expect(useConversationStore.getState().activeConversationId).toBe('conv-1');

      // Create second conversation (should not change active)
      store.addMessage({
        id: 'msg-2',
        conversationId: 'conv-2',
        role: 'user',
        content: 'Second',
        timestamp: Date.now(),
      });

      // Active should still be conv-1 (first one set)
      expect(useConversationStore.getState().activeConversationId).toBe('conv-1');

      // Explicitly set active
      store.setActiveConversation('conv-2');
      expect(useConversationStore.getState().activeConversationId).toBe('conv-2');
    });

    it('should handle error during streaming', () => {
      const store = useConversationStore.getState();
      const conversationId = 'conv-error';

      store.addUserMessage(conversationId, 'Test');

      // Start streaming
      store.appendToStream({
        conversationId,
        messageId: 'msg-1',
        content: 'Starting...',
        done: false,
      });

      // Error occurs
      store.setError('API Error');

      // Stream ends abnormally
      store.appendToStream({
        conversationId,
        messageId: 'msg-1',
        content: '',
        done: true,
      });

      const state = useConversationStore.getState();
      expect(state.isStreaming).toBe(false);
      // Conversation should still exist
      expect(state.conversations).toHaveLength(1);
    });
  });

  describe('State Persistence', () => {
    it('should never lose conversation data during normal flow', () => {
      const store = useConversationStore.getState();
      const conversationId = 'persist-test';

      // Simulate complete flow
      store.addUserMessage(conversationId, 'User message');

      // Check after each operation
      expect(useConversationStore.getState().conversations).toHaveLength(1);

      store.addMessage({
        id: 'system',
        conversationId,
        role: 'assistant',
        content: 'System',
        timestamp: Date.now(),
      });
      expect(useConversationStore.getState().conversations).toHaveLength(1);
      expect(useConversationStore.getState().conversations[0].messages).toHaveLength(2);

      store.appendToStream({
        conversationId,
        messageId: 'response',
        content: 'AI response',
        done: false,
      });
      expect(useConversationStore.getState().conversations).toHaveLength(1);
      expect(useConversationStore.getState().conversations[0].messages).toHaveLength(2);

      store.appendToStream({
        conversationId,
        messageId: 'response',
        content: '',
        done: true,
      });
      expect(useConversationStore.getState().conversations).toHaveLength(1);

      // Conversation should never disappear
      const finalState = useConversationStore.getState();
      expect(finalState.conversations).toHaveLength(1);
      expect(finalState.conversations[0].id).toBe(conversationId);
      expect(finalState.activeConversationId).toBe(conversationId);
    });

    it('should handle disconnect/reconnect scenario', () => {
      const store = useConversationStore.getState();

      // User has existing conversation
      store.addUserMessage('conv-1', 'Before disconnect');

      // Simulate disconnect error
      store.setError('Connection lost');

      // State should persist
      expect(useConversationStore.getState().conversations).toHaveLength(1);

      // Clear error (reconnect)
      store.setError(null);

      // Can still interact
      store.addUserMessage('conv-1', 'After reconnect');
      expect(useConversationStore.getState().conversations[0].messages).toHaveLength(2);
    });
  });

  describe('Simulated Socket Events', () => {
    /**
     * This test simulates the exact sequence of socket events
     * that occur when a user sends a message.
     */
    it('should handle full socket event sequence correctly', () => {
      const store = useConversationStore.getState();
      const conversationId = 'socket-test';
      const messageId = 'ai-response-123';

      // 1. Client action: User sends message
      // (In real app: createConversation() then sendMessage())
      store.addUserMessage(conversationId, 'What opening should I play?');

      // Verify client-side state
      let state = useConversationStore.getState();
      expect(state.activeConversationId).toBe(conversationId);
      expect(state.conversations[0].messages).toHaveLength(1);

      // 2. Server event: conversation:message (system message)
      store.addMessage({
        id: `system-${conversationId}`,
        conversationId,
        role: 'assistant',
        content: 'New conversation started.',
        timestamp: Date.now(),
      });

      state = useConversationStore.getState();
      expect(state.conversations[0].messages).toHaveLength(2);

      // 3. Server event: conversation:stream (multiple chunks)
      const chunks = [
        'I recommend ',
        'the Italian Game ',
        'for beginners. ',
        'It starts with ',
        '1. e4 e5 2. Nf3 Nc6 3. Bc4.',
      ];

      for (const chunk of chunks) {
        store.appendToStream({
          conversationId,
          messageId,
          content: chunk,
          done: false,
        });
      }

      state = useConversationStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingMessage?.content).toBe(chunks.join(''));

      // 4. Server event: conversation:stream (done)
      store.appendToStream({
        conversationId,
        messageId,
        content: '',
        done: true,
      });

      state = useConversationStore.getState();
      expect(state.isStreaming).toBe(false);

      // 5. Server event: conversation:end
      store.finalizeStream(conversationId);

      // Final verification
      state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.activeConversationId).toBe(conversationId);
      expect(state.isStreaming).toBe(false);
      expect(state.streamingMessage).toBeNull();

      // Messages should include: user message, system message
      // (AI response would be added separately via conversation:message after tool processing)
    });
  });
});

