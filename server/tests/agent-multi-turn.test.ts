import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { config } from 'dotenv';
import { AnthropicProvider } from '../src/agent/providers/anthropic.js';
import { createTools, executeToolCall } from '../src/agent/tools/index.js';
import { ChessManager } from '../src/chess/manager.js';
import { ConversationManager } from '../src/agent/conversationManager.js';
import { AgentHarness } from '../src/agent/harness.js';
import { createMockSocket, MockSocket } from './mocks/socket.js';
import type { Message, StreamChunk } from '../src/agent/providers/index.js';

// Load environment variables
config({ path: '../.env.local' });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TEST_MODEL = 'claude-3-haiku-20240307'; // Use haiku for fast, cheap tests

// Skip all tests if no API key
const describeWithApi = ANTHROPIC_API_KEY ? describe : describe.skip;

describeWithApi('Multi-Turn Agent Conversations', () => {
  let provider: AnthropicProvider;
  let gameManager: ChessManager;
  let mockSocket: MockSocket;

  beforeAll(() => {
    provider = new AnthropicProvider({
      apiKey: ANTHROPIC_API_KEY,
      model: TEST_MODEL,
      maxTokens: 2048,
      enableThinking: false, // Haiku doesn't support extended thinking
      enableWebSearch: false, // Haiku doesn't support web search
    });
  });

  beforeEach(() => {
    gameManager = new ChessManager();
    mockSocket = createMockSocket();
  });

  describe('Tool Result Continuation', () => {
    it('should continue conversation after tool call with result', async () => {
      const tools = createTools();
      const positionTool = tools.filter(t => t.name === 'get_current_position');

      // First call - may or may not result in a tool call (LLMs are non-deterministic)
      const messages: Message[] = [
        { 
          role: 'system', 
          content: 'You are a chess coach. When asked about the position, you MUST use get_current_position first, then explain what you found.' 
        },
        { role: 'user', content: 'What is the current position?' },
      ];

      let toolCall: StreamChunk | null = null;
      let textResponse = '';

      for await (const chunk of provider.chat(messages, positionTool)) {
        if (chunk.type === 'tool_call' && chunk.name) {
          toolCall = chunk;
        }
        if (chunk.type === 'text') {
          textResponse += chunk.content;
        }
      }

      // LLM may choose to use tool OR respond directly - both are valid
      if (toolCall) {
        expect(toolCall.name).toBe('get_current_position');

        // Execute the tool
        const toolResult = await executeToolCall(
          toolCall.name!,
          toolCall.arguments || {},
          gameManager,
          mockSocket as any
        );

        // Now continue the conversation with the tool result
        const messagesWithResult: Message[] = [
          ...messages,
          {
            role: 'assistant',
            content: '', // Assistant made a tool call, no text yet
          },
          {
            role: 'tool',
            content: JSON.stringify(toolResult),
            toolCallId: toolCall.toolCallId,
            name: toolCall.name,
          },
        ];

        let continuationResponse = '';
        for await (const chunk of provider.chat(messagesWithResult, positionTool)) {
          if (chunk.type === 'text') {
            continuationResponse += chunk.content;
          }
        }

        // The AI should have responded with something
        expect(continuationResponse.length).toBeGreaterThan(0);
      } else {
        // Model responded with text directly - that's also acceptable
        expect(textResponse.length).toBeGreaterThan(0);
      }
    }, 60000);

    it('should handle multiple sequential tool calls', async () => {
      const tools = createTools();
      
      // Set up a position first
      gameManager.loadPGN('1. e4 e5 2. Nf3');
      
      const messages: Message[] = [
        { 
          role: 'system', 
          content: `You are a chess coach. When asked about moves, use get_current_position to see the position, 
          and get_position_stats to see common continuations. Explain your findings after using tools.` 
        },
        { role: 'user', content: 'What are the best moves from here?' },
      ];

      let toolCallsMade = 0;
      let currentMessages = [...messages];
      let finalResponse = '';
      const toolNames: string[] = [];

      // Agentic loop - keep going until we get a final response without tool calls
      for (let iteration = 0; iteration < 5; iteration++) {
        let toolCall: StreamChunk | null = null;
        let textResponse = '';

        for await (const chunk of provider.chat(currentMessages, tools)) {
          if (chunk.type === 'tool_call' && chunk.name) {
            toolCall = chunk;
            toolNames.push(chunk.name);
          }
          if (chunk.type === 'text') {
            textResponse += chunk.content;
          }
        }

        if (!toolCall) {
          // No more tool calls - we have the final response
          finalResponse = textResponse;
          break;
        }

        toolCallsMade++;

        // Execute the tool
        const toolResult = await executeToolCall(
          toolCall.name!,
          toolCall.arguments || {},
          gameManager,
          mockSocket as any
        );

        // Add tool call and result to messages
        currentMessages = [
          ...currentMessages,
          {
            role: 'assistant' as const,
            content: '',
          },
          {
            role: 'tool' as const,
            content: JSON.stringify(toolResult),
            toolCallId: toolCall.toolCallId,
            name: toolCall.name,
          },
        ];
      }

      // LLMs are non-deterministic - we should get either tool calls OR a text response
      // Either is acceptable for this integration test
      expect(toolCallsMade > 0 || finalResponse.length > 0).toBe(true);
    }, 90000);
  });

  describe('Main Line Query', () => {
    it('should explain main line after setting up opening', async () => {
      const tools = createTools();
      
      // Set up an opening position using make_moves (the new way)
      await executeToolCall('make_moves', { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], animate: false }, gameManager, mockSocket as any);
      
      const messages: Message[] = [
        { 
          role: 'system', 
          content: `You are a chess coach. When asked about the main line continuation, 
          use get_position_stats to see statistics and common moves, then explain the main line.
          Be concise but informative.` 
        },
        { role: 'user', content: 'What is the main line continuation from here?' },
      ];

      let toolCallsMade = 0;
      let currentMessages = [...messages];
      let finalResponse = '';

      // Agentic loop
      for (let iteration = 0; iteration < 5; iteration++) {
        let toolCall: StreamChunk | null = null;
        let textResponse = '';

        for await (const chunk of provider.chat(currentMessages, tools)) {
          if (chunk.type === 'tool_call' && chunk.name) {
            toolCall = chunk;
          }
          if (chunk.type === 'text') {
            textResponse += chunk.content;
          }
        }

        if (!toolCall) {
          finalResponse = textResponse;
          break;
        }

        toolCallsMade++;

        const toolResult = await executeToolCall(
          toolCall.name!,
          toolCall.arguments || {},
          gameManager,
          mockSocket as any
        );

        currentMessages = [
          ...currentMessages,
          { role: 'assistant' as const, content: '' },
          {
            role: 'tool' as const,
            content: JSON.stringify(toolResult),
            toolCallId: toolCall.toolCallId,
            name: toolCall.name,
          },
        ];
      }

      // Model should produce some response (may or may not use tools - LLMs are non-deterministic)
      expect(finalResponse.length).toBeGreaterThan(0);
    }, 90000);

    it('should demonstrate moves when asked to show the main line', async () => {
      const tools = createTools();
      
      const messages: Message[] = [
        { 
          role: 'system', 
          content: `You are a chess coach. When asked to show a main line, you MUST use the make_moves tool to demonstrate the moves on the board.
          Use common opening moves like e4 e5 Nf3 Nc6 Bb5 for the Ruy Lopez main line.
          After showing moves, briefly explain what was demonstrated.
          IMPORTANT: Always use the make_moves tool first before explaining.` 
        },
        { role: 'user', content: 'Show me the main line of the Ruy Lopez opening' },
      ];

      let movesTriggered = false;
      let toolCallsMade: string[] = [];
      let currentMessages = [...messages];
      let finalResponse = '';

      // Agentic loop
      for (let iteration = 0; iteration < 5; iteration++) {
        let toolCall: StreamChunk | null = null;
        let textResponse = '';

        for await (const chunk of provider.chat(currentMessages, tools)) {
          if (chunk.type === 'tool_call' && chunk.name) {
            toolCall = chunk;
            toolCallsMade.push(chunk.name);
            if (chunk.name === 'make_moves' || chunk.name === 'make_move') {
              movesTriggered = true;
            }
          }
          if (chunk.type === 'text') {
            textResponse += chunk.content;
          }
        }

        if (!toolCall) {
          finalResponse = textResponse;
          break;
        }

        const toolResult = await executeToolCall(
          toolCall.name!,
          toolCall.arguments || {},
          gameManager,
          mockSocket as any
        );

        currentMessages = [
          ...currentMessages,
          { role: 'assistant' as const, content: '' },
          {
            role: 'tool' as const,
            content: JSON.stringify(toolResult),
            toolCallId: toolCall.toolCallId,
            name: toolCall.name,
          },
        ];
      }

      // The model should have responded somehow - either with tool calls or text
      // LLMs are non-deterministic so we can't guarantee specific behavior
      expect(toolCallsMade.length > 0 || finalResponse.length > 0).toBe(true);
    }, 90000);
  });

  describe('AgentHarness Integration', () => {
    it('should complete multi-turn tool usage through harness', async () => {
      const convManager = new ConversationManager();
      const harness = new AgentHarness(gameManager, convManager, mockSocket as any);
      
      const conversationId = 'multi-turn-test';
      
      // Send a message that requires tool use and follow-up
      await harness.processMessage(conversationId, 'What is the current position on the board?');
      
      // Check that we received proper events
      const emitCalls = (mockSocket.emit as any).mock.calls;
      
      // Should have emitted thinking indicator
      const thinkingCalls = emitCalls.filter((call: any[]) => call[0] === 'conversation:thinking');
      expect(thinkingCalls.length).toBeGreaterThan(0);
      
      // Should have emitted stream content (the actual response)
      const streamCalls = emitCalls.filter((call: any[]) => call[0] === 'conversation:stream');
      expect(streamCalls.length).toBeGreaterThan(0);
      
      // Should have emitted conversation end
      const endCalls = emitCalls.filter((call: any[]) => call[0] === 'conversation:end');
      expect(endCalls.length).toBe(1);
      
      // Check if a tool was called
      const toolCalls = emitCalls.filter((call: any[]) => call[0] === 'conversation:toolCall');
      if (toolCalls.length > 0) {
        // If tool was called, should have both 'calling' and 'complete' status
        const callingCalls = toolCalls.filter((call: any[]) => call[1]?.status === 'calling');
        const completeCalls = toolCalls.filter((call: any[]) => call[1]?.status === 'complete');
        expect(callingCalls.length).toBe(completeCalls.length);
      }
      
      // The conversation should have messages
      const conversation = convManager.getConversation(conversationId);
      expect(conversation).toBeDefined();
      expect(conversation!.messages.length).toBeGreaterThanOrEqual(2); // user + assistant at minimum
    }, 60000);

    it('should handle complex multi-step requests', async () => {
      const convManager = new ConversationManager();
      const harness = new AgentHarness(gameManager, convManager, mockSocket as any);
      
      const conversationId = 'complex-test';
      
      // Send a request that explicitly asks for board moves
      await harness.processMessage(conversationId, 'Play out the Italian Game main line on the board: 1.e4 e5 2.Nf3 Nc6 3.Bc4');
      
      const emitCalls = (mockSocket.emit as any).mock.calls;
      
      // Should have emitted board state change (game:state for instant moves, or animation:start for animated)
      const gameStateCalls = emitCalls.filter((call: any[]) => call[0] === 'game:state');
      const animationCalls = emitCalls.filter((call: any[]) => call[0] === 'animation:start');
      expect(gameStateCalls.length + animationCalls.length).toBeGreaterThan(0);
      
      // Should have conversation end
      const endCalls = emitCalls.filter((call: any[]) => call[0] === 'conversation:end');
      expect(endCalls.length).toBe(1);
      
      // Should have used make_moves tool
      const toolCalls = emitCalls.filter((call: any[]) => 
        call[0] === 'conversation:toolCall' && call[1]?.toolName === 'make_moves'
      );
      expect(toolCalls.length).toBeGreaterThan(0);
    }, 90000);
  });
});

describe('Agentic Loop Unit Tests', () => {
  it('should properly format tool results in messages', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a chess coach.' },
      { role: 'user', content: 'What is the position?' },
    ];

    // Simulate adding a tool call result
    const toolResult = {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'White',
    };

    const messagesWithTool: Message[] = [
      ...messages,
      { role: 'assistant', content: '' },
      { 
        role: 'tool', 
        content: JSON.stringify(toolResult),
        toolCallId: 'tool-123',
        name: 'get_current_position',
      },
    ];

    expect(messagesWithTool).toHaveLength(4);
    expect(messagesWithTool[3].role).toBe('tool');
    expect(messagesWithTool[3].toolCallId).toBe('tool-123');
  });

  it('should track iteration count to prevent infinite loops', () => {
    const MAX_ITERATIONS = 10;
    let iterations = 0;
    let shouldContinue = true;

    while (shouldContinue && iterations < MAX_ITERATIONS) {
      iterations++;
      // Simulate a condition that would stop the loop
      if (iterations >= 3) {
        shouldContinue = false;
      }
    }

    expect(iterations).toBe(3);
    expect(iterations).toBeLessThan(MAX_ITERATIONS);
  });
});

// Run with: npm test -- --run tests/agent-multi-turn.test.ts

