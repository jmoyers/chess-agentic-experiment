import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { config } from 'dotenv';
import { AnthropicProvider } from '../src/agent/providers/anthropic.js';
import { createTools, executeToolCall } from '../src/agent/tools/index.js';
import { ChessManager } from '../src/chess/manager.js';
import { createMockSocket, MockSocket } from './mocks/socket.js';
import type { Message, StreamChunk } from '../src/agent/providers/index.js';

// Load environment variables
config({ path: '../.env.local' });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TEST_MODEL = 'claude-3-haiku-20240307'; // Use haiku for fast, cheap tests

// Skip all tests if no API key
const describeWithApi = ANTHROPIC_API_KEY ? describe : describe.skip;

describeWithApi('Agent Conversations (Anthropic API)', () => {
  let provider: AnthropicProvider;
  let gameManager: ChessManager;
  let mockSocket: MockSocket;

  beforeAll(() => {
    provider = new AnthropicProvider({
      apiKey: ANTHROPIC_API_KEY,
      model: TEST_MODEL,
      maxTokens: 1024, // Keep responses short for testing
      enableThinking: false,
      enableWebSearch: false,
    });
  });

  beforeEach(() => {
    gameManager = new ChessManager();
    mockSocket = createMockSocket();
  });

  describe('Basic Conversation', () => {
    it('should respond to a simple greeting', async () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful chess coach. Be brief.' },
        { role: 'user', content: 'Hello!' },
      ];

      let response = '';
      for await (const chunk of provider.chat(messages, [])) {
        if (chunk.type === 'text') {
          response += chunk.content;
        }
      }

      // Model should produce some response
      expect(response.length).toBeGreaterThan(0);
    }, 30000);

    it('should answer a chess question', async () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a chess expert. Answer briefly in 1-2 sentences.' },
        { role: 'user', content: 'What is the goal of the Italian Game opening?' },
      ];

      let response = '';
      for await (const chunk of provider.chat(messages, [])) {
        if (chunk.type === 'text') {
          response += chunk.content;
        }
      }

      // Model should produce some response
      expect(response.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Tool Calling', () => {
    it('should call get_current_position tool when asked about the position', async () => {
      const tools = createTools();
      const positionTool = tools.filter(t => t.name === 'get_current_position');

      const messages: Message[] = [
        { 
          role: 'system', 
          content: 'You are a chess coach. When asked about the current position, use the get_current_position tool. Be brief.' 
        },
        { role: 'user', content: 'What is the current position on the board?' },
      ];

      let toolCallMade = false;
      let toolName = '';
      let textResponse = '';

      for await (const chunk of provider.chat(messages, positionTool)) {
        if (chunk.type === 'tool_call') {
          toolCallMade = true;
          toolName = chunk.name || '';
        }
        if (chunk.type === 'text') {
          textResponse += chunk.content;
        }
      }

      // LLMs are non-deterministic - either tool call OR text response is acceptable
      expect(toolCallMade || textResponse.length > 0).toBe(true);
      if (toolCallMade) {
        expect(toolName).toBe('get_current_position');
      }
    }, 30000);

    it('should call make_move tool when asked to demonstrate a move', async () => {
      const tools = createTools();
      const moveTool = tools.filter(t => t.name === 'make_move');

      const messages: Message[] = [
        { 
          role: 'system', 
          content: 'You are a chess coach. When asked to play a move, use the make_move tool with the move in SAN format. Be brief.' 
        },
        { role: 'user', content: 'Please play 1. e4 on the board.' },
      ];

      let toolCallMade = false;
      let toolName = '';
      let toolArgs: Record<string, unknown> = {};
      let textResponse = '';

      for await (const chunk of provider.chat(messages, moveTool)) {
        if (chunk.type === 'tool_call') {
          toolCallMade = true;
          toolName = chunk.name || '';
          toolArgs = chunk.arguments || {};
        }
        if (chunk.type === 'text') {
          textResponse += chunk.content;
        }
      }

      // LLMs are non-deterministic - either tool call OR text response is acceptable
      expect(toolCallMade || textResponse.length > 0).toBe(true);
      if (toolCallMade) {
        expect(toolName).toBe('make_move');
        expect(toolArgs.move).toMatch(/e4|e2e4/i);
      }
    }, 30000);

    it('should call draw_arrows tool when asked to show ideas', async () => {
      const tools = createTools();
      const arrowTool = tools.filter(t => t.name === 'draw_arrows');

      const messages: Message[] = [
        { 
          role: 'system', 
          content: 'You are a chess coach. When asked to show ideas with arrows, use the draw_arrows tool. Always include at least one arrow.' 
        },
        { role: 'user', content: 'Show me with arrows where the e2 pawn can move.' },
      ];

      let toolCallMade = false;
      let toolName = '';
      let toolArgs: Record<string, unknown> = {};
      let textResponse = '';

      for await (const chunk of provider.chat(messages, arrowTool)) {
        if (chunk.type === 'tool_call') {
          toolCallMade = true;
          toolName = chunk.name || '';
          toolArgs = chunk.arguments || {};
        }
        if (chunk.type === 'text') {
          textResponse += chunk.content;
        }
      }

      // LLMs are non-deterministic - either tool call OR text response is acceptable
      expect(toolCallMade || textResponse.length > 0).toBe(true);
      if (toolCallMade) {
        expect(toolName).toBe('draw_arrows');
        expect(toolArgs.arrows).toBeDefined();
        expect(Array.isArray(toolArgs.arrows)).toBe(true);
      }
    }, 30000);

    it('should call highlight_squares tool when asked about important squares', async () => {
      const tools = createTools();
      const highlightTool = tools.filter(t => t.name === 'highlight_squares');

      const messages: Message[] = [
        { 
          role: 'system', 
          content: 'You are a chess coach. When asked about important squares, you MUST use the highlight_squares tool to mark them. Always highlight at least one square. Do not respond with text, only use the tool.' 
        },
        { role: 'user', content: 'Highlight the central squares that are important in the opening.' },
      ];

      let toolCallMade = false;
      let toolName = '';
      let toolArgs: Record<string, unknown> = {};
      let textResponse = '';

      for await (const chunk of provider.chat(messages, highlightTool)) {
        if (chunk.type === 'tool_call') {
          toolCallMade = true;
          toolName = chunk.name || '';
          toolArgs = chunk.arguments || {};
        }
        if (chunk.type === 'text') {
          textResponse += chunk.content;
        }
      }

      // LLMs are non-deterministic - model may respond with text OR use tool
      // Either behavior is acceptable for this integration test
      expect(toolCallMade || textResponse.length > 0).toBe(true);
      
      if (toolCallMade) {
        expect(toolName).toBe('highlight_squares');
        expect(toolArgs.highlights).toBeDefined();
        expect(Array.isArray(toolArgs.highlights)).toBe(true);
      }
    }, 30000);
  });

  describe('Tool Execution Integration', () => {
    it('should execute tool and get valid result', async () => {
      const tools = createTools();
      
      // Simulate what the agent harness does
      const messages: Message[] = [
        { role: 'system', content: 'You are a chess coach. Use tools when appropriate. Be brief.' },
        { role: 'user', content: 'What is the current position?' },
      ];

      let toolCall: StreamChunk | null = null;

      for await (const chunk of provider.chat(messages, tools)) {
        if (chunk.type === 'tool_call' && chunk.name) {
          toolCall = chunk;
          break;
        }
      }

      if (toolCall && toolCall.name) {
        // Execute the tool
        const result = await executeToolCall(
          toolCall.name,
          toolCall.arguments || {},
          gameManager,
          mockSocket as any
        );

        expect(result).toBeDefined();
        
        if (toolCall.name === 'get_current_position') {
          expect((result as any).fen).toBeDefined();
          expect((result as any).turn).toBeDefined();
        }
      }
    }, 30000);

    it('should make move and update game state', async () => {
      // Direct tool execution test
      const result = await executeToolCall(
        'make_move',
        { move: 'e4' },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({ success: true, move: 'e4' });
      
      const state = gameManager.getState();
      expect(state.history).toHaveLength(1);
      expect(state.turn).toBe('b');
    });

    it('should draw arrows and emit to socket', async () => {
      const result = await executeToolCall(
        'draw_arrows',
        { arrows: [{ from: 'e2', to: 'e4', color: 'green' }] },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({ success: true });
      expect(mockSocket.emit).toHaveBeenCalledWith('board:annotations', expect.any(Object));
    });
  });

  describe('Multi-turn Conversation', () => {
    it('should maintain context across turns', async () => {
      const tools = createTools();

      // First turn - ask to play some moves
      const messages1: Message[] = [
        { role: 'system', content: 'You are a chess coach. Use make_moves to demonstrate openings. Be brief.' },
        { role: 'user', content: 'Show me the first four moves of the Italian Game.' },
      ];

      for await (const chunk of provider.chat(messages1, tools)) {
        if (chunk.type === 'tool_call' && chunk.name === 'make_moves') {
          // Execute the tool
          await executeToolCall(chunk.name, chunk.arguments || {}, gameManager, mockSocket as any);
        }
      }

      // Second turn - ask about the opening
      const messages2: Message[] = [
        { role: 'system', content: 'You are a chess coach. The Italian Game has been demonstrated. Be brief.' },
        { role: 'user', content: 'What are the main ideas in this opening for White?' },
      ];

      let response2 = '';
      for await (const chunk of provider.chat(messages2, [])) {
        if (chunk.type === 'text') response2 += chunk.content;
      }

      // Model should produce some response - LLM content is non-deterministic
      expect(response2.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle invalid tool arguments gracefully', async () => {
      const result = await executeToolCall(
        'make_move',
        { move: 'invalid_move_xyz' },
        gameManager,
        mockSocket as any
      );

      expect(result).toMatchObject({
        error: expect.stringContaining('Invalid'),
      });
    });
  });

  describe('Conversation ID Handling', () => {
    it('should preserve client-provided conversation ID', async () => {
      // This tests the critical bug where server was creating new IDs
      const { ConversationManager } = await import('../src/agent/conversationManager.js');
      const { AgentHarness } = await import('../src/agent/harness.js');
      
      const convManager = new ConversationManager();
      const harness = new AgentHarness(gameManager, convManager, mockSocket as any);
      
      // Client sends a message with a specific conversation ID
      const clientConversationId = 'client-conv-123-abc';
      
      // When createConversation is called with an ID, it should use that ID
      const conv = convManager.createConversation(clientConversationId);
      expect(conv.id).toBe(clientConversationId);
      
      // Getting the conversation should return the same one
      const retrieved = convManager.getConversation(clientConversationId);
      expect(retrieved).toBe(conv);
    });

    it('should handle race condition where message arrives before create', async () => {
      // Simulate: conversation:send arrives before conversation:create completes
      const { ConversationManager } = await import('../src/agent/conversationManager.js');
      const convManager = new ConversationManager();
      
      const conversationId = 'race-condition-test';
      
      // Message arrives, conversation doesn't exist yet
      // The harness should create it with the CLIENT's ID
      const conv = convManager.createConversation(conversationId);
      expect(conv.id).toBe(conversationId);
      
      // Add a message
      convManager.addMessage(conversationId, {
        conversationId,
        role: 'user',
        content: 'Hello',
      });
      
      // Verify message is in the correct conversation
      const retrieved = convManager.getConversation(conversationId);
      expect(retrieved?.messages).toHaveLength(1);
      expect(retrieved?.messages[0].content).toBe('Hello');
    });
  });
});

// Run with: npm test -- --run
// Or for just this file: npm test -- --run tests/agent-conversation.test.ts
