import { describe, it, expect, beforeAll } from 'vitest';
import OpenAI from 'openai';
import { OpenAIProvider } from '../src/agent/providers/openai.js';
import type { Message } from '../src/agent/providers/index.js';
import type { Tool } from '@chess/shared';

/**
 * Integration test for ChatGPT 5.2 (gpt-5.2) model via OpenAI API.
 * 
 * This test verifies that:
 * 1. The OpenAI client can be constructed with an API key
 * 2. The gpt-5.2 model name is valid and accepted by the API
 * 3. Basic chat completion works with the model
 * 4. Tool call message formatting works correctly
 * 
 * Run with: npx vitest run tests/openai-chatgpt52.test.ts
 * 
 * Note: Requires OPENAI_API_KEY environment variable to be set for live tests.
 * Tests are skipped if the API key is not available.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const hasApiKey = !!OPENAI_API_KEY;

describe('ChatGPT 5.2 (gpt-5.2) Integration', () => {
  describe('OpenAI Client Configuration', () => {
    it('should create OpenAI client successfully', () => {
      // Even without a real key, we should be able to construct the client
      const client = new OpenAI({
        apiKey: OPENAI_API_KEY || 'test-key',
      });
      
      expect(client).toBeDefined();
      expect(client.chat).toBeDefined();
      expect(client.chat.completions).toBeDefined();
    });
  });

  describe.skipIf(!hasApiKey)('Live API Tests (requires OPENAI_API_KEY)', () => {
    let client: OpenAI;

    beforeAll(() => {
      client = new OpenAI({
        apiKey: OPENAI_API_KEY,
      });
    });

    it('should make a basic chat completion request with gpt-5.2', async () => {
      // NOTE: gpt-5.2 requires max_completion_tokens instead of max_tokens
      const response = await client.chat.completions.create({
        model: 'gpt-5.2',
        messages: [
          { role: 'user', content: 'Say "hello" and nothing else.' }
        ],
        max_completion_tokens: 10,
      });

      expect(response).toBeDefined();
      expect(response.choices).toBeDefined();
      expect(response.choices.length).toBeGreaterThan(0);
      expect(response.choices[0].message).toBeDefined();
      expect(response.choices[0].message.content).toBeDefined();
      
      console.log('ChatGPT 5.2 response:', response.choices[0].message.content);
    }, 30000); // 30 second timeout for API call

    it('should stream responses from gpt-5.2', async () => {
      // NOTE: gpt-5.2 requires max_completion_tokens instead of max_tokens
      const stream = await client.chat.completions.create({
        model: 'gpt-5.2',
        messages: [
          { role: 'user', content: 'Count from 1 to 3.' }
        ],
        max_completion_tokens: 20,
        stream: true,
      });

      const chunks: string[] = [];
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          chunks.push(content);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      const fullResponse = chunks.join('');
      console.log('ChatGPT 5.2 streamed response:', fullResponse);
      expect(fullResponse).toBeTruthy();
    }, 30000);

    it('should handle tool calls with gpt-5.2', async () => {
      // NOTE: gpt-5.2 requires max_completion_tokens instead of max_tokens
      const response = await client.chat.completions.create({
        model: 'gpt-5.2',
        messages: [
          { role: 'user', content: 'What is 2 + 2? Use the calculator tool.' }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculator',
              description: 'Performs basic arithmetic calculations',
              parameters: {
                type: 'object',
                properties: {
                  expression: {
                    type: 'string',
                    description: 'The math expression to evaluate',
                  },
                },
                required: ['expression'],
              },
            },
          },
        ],
        max_completion_tokens: 100,
      });

      expect(response).toBeDefined();
      expect(response.choices).toBeDefined();
      expect(response.choices.length).toBeGreaterThan(0);
      
      // The model might call the tool or answer directly
      const choice = response.choices[0];
      console.log('ChatGPT 5.2 tool test - finish_reason:', choice.finish_reason);
      
      if (choice.finish_reason === 'tool_calls') {
        expect(choice.message.tool_calls).toBeDefined();
        expect(choice.message.tool_calls!.length).toBeGreaterThan(0);
        console.log('Tool called:', choice.message.tool_calls![0].function.name);
      } else {
        console.log('Model response:', choice.message.content);
      }
    }, 30000);
  });

  describe('Model Name Validation', () => {
    it('should have correct model name format', () => {
      const modelName = 'gpt-5.2';
      
      // OpenAI model names follow pattern: gpt-{version}[-variant]
      expect(modelName).toMatch(/^gpt-\d+(\.\d+)?(-\w+)?$/);
    });
  });

  describe.skipIf(!hasApiKey)('Multi-turn Tool Calls (requires OPENAI_API_KEY)', () => {
    let provider: OpenAIProvider;
    
    const testTool: Tool = {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City name',
          },
        },
        required: ['location'],
      },
    };

    beforeAll(() => {
      provider = new OpenAIProvider();
      provider.setModel('chatgpt-5.2');
    });

    it('should handle initial tool call request', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'What is the weather in Paris? Use the get_weather tool.' },
      ];

      const chunks: Array<{ type: string; name?: string; toolCallId?: string }> = [];
      
      for await (const chunk of provider.chat(messages, [testTool])) {
        chunks.push({ type: chunk.type, name: chunk.name, toolCallId: chunk.toolCallId });
        if (chunk.type === 'tool_call') {
          console.log('Tool call received:', chunk.name, chunk.toolCallId);
        }
      }

      // Should have received a tool call
      const toolCallChunk = chunks.find(c => c.type === 'tool_call');
      expect(toolCallChunk).toBeDefined();
      expect(toolCallChunk?.name).toBe('get_weather');
      expect(toolCallChunk?.toolCallId).toBeDefined();
    }, 30000);

    it('should handle conversation continuation after tool result', async () => {
      // This tests the exact scenario that was failing:
      // 1. User asks question
      // 2. Assistant makes tool call
      // 3. Tool result is returned
      // 4. User asks follow-up
      
      // First, get the tool call
      const initialMessages: Message[] = [
        { role: 'user', content: 'What is the weather in Tokyo? Use the get_weather tool.' },
      ];

      let toolCallId = '';
      let toolName = '';
      let toolArgs: Record<string, unknown> = {};

      for await (const chunk of provider.chat(initialMessages, [testTool])) {
        if (chunk.type === 'tool_call' && chunk.toolCallId) {
          toolCallId = chunk.toolCallId;
          toolName = chunk.name || '';
          toolArgs = chunk.arguments || {};
          console.log('First call - Tool call:', toolName, toolCallId);
        }
      }

      expect(toolCallId).toBeTruthy();
      
      // Now continue the conversation with the tool result
      // This is the message format the harness uses
      const continuationMessages: Message[] = [
        { role: 'user', content: 'What is the weather in Tokyo? Use the get_weather tool.' },
        { role: 'assistant', content: '' }, // Assistant message that triggered tool call
        { 
          role: 'tool', 
          content: JSON.stringify({ temperature: 22, condition: 'sunny' }),
          toolCallId: toolCallId,
          name: toolName,
          toolArguments: toolArgs,
        },
      ];

      const responseChunks: string[] = [];
      
      for await (const chunk of provider.chat(continuationMessages, [testTool])) {
        if (chunk.type === 'text') {
          responseChunks.push(chunk.content);
        }
      }

      const response = responseChunks.join('');
      console.log('Continuation response:', response.slice(0, 200));
      
      // Should have received a text response (not an error)
      expect(response.length).toBeGreaterThan(0);
      expect(response.toLowerCase()).not.toContain('error');
    }, 60000);

    it('should handle multiple tool results in sequence', async () => {
      // Test with two tool calls and results
      const messages: Message[] = [
        { role: 'user', content: 'Compare weather in Paris and London. Use get_weather for each.' },
        { role: 'assistant', content: '' },
        { 
          role: 'tool', 
          content: JSON.stringify({ temperature: 18, condition: 'cloudy' }),
          toolCallId: 'call_paris_123',
          name: 'get_weather',
          toolArguments: { location: 'Paris' },
        },
        { 
          role: 'tool', 
          content: JSON.stringify({ temperature: 15, condition: 'rainy' }),
          toolCallId: 'call_london_456',
          name: 'get_weather',
          toolArguments: { location: 'London' },
        },
      ];

      const responseChunks: string[] = [];
      let hadError = false;
      
      for await (const chunk of provider.chat(messages, [testTool])) {
        if (chunk.type === 'text') {
          responseChunks.push(chunk.content);
          if (chunk.content.toLowerCase().includes('error')) {
            hadError = true;
          }
        }
      }

      const response = responseChunks.join('');
      console.log('Multi-tool response:', response.slice(0, 200));
      
      // Should not have error messages
      expect(hadError).toBe(false);
      expect(response.length).toBeGreaterThan(0);
    }, 60000);
  });
});

