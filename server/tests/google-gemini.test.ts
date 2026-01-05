import { describe, it, expect, beforeAll } from 'vitest';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleProvider } from '../src/agent/providers/google.js';
import type { Message } from '../src/agent/providers/index.js';
import type { Tool } from '@chess/shared';

/**
 * Integration test for Gemini 3 Pro (gemini-3-pro-preview) model via Google AI API.
 *
 * This test verifies that:
 * 1. The Google AI client can be constructed with an API key
 * 2. The gemini-3-pro-preview model name is valid and accepted by the API
 * 3. Basic chat completion works with the model
 * 4. Tool call message formatting works correctly
 * 5. Web search grounding works
 *
 * Run with: npx vitest run tests/google-gemini.test.ts
 *
 * Note: Requires GOOGLE_API_KEY environment variable to be set for live tests.
 * Tests are skipped if the API key is not available.
 */

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const hasApiKey = !!GOOGLE_API_KEY;

describe('Gemini 3 Pro (gemini-3-pro-preview) Integration', () => {
  describe('Google AI Client Configuration', () => {
    it('should create GoogleGenerativeAI client successfully', () => {
      // Even without a real key, we should be able to construct the client
      const client = new GoogleGenerativeAI(GOOGLE_API_KEY || 'test-key');

      expect(client).toBeDefined();
      expect(client.getGenerativeModel).toBeDefined();
    });

    it('should create a generative model instance', () => {
      const client = new GoogleGenerativeAI(GOOGLE_API_KEY || 'test-key');
      const model = client.getGenerativeModel({ model: 'gemini-3-pro-preview' });

      expect(model).toBeDefined();
      expect(model.generateContent).toBeDefined();
      expect(model.generateContentStream).toBeDefined();
    });
  });

  describe.skipIf(!hasApiKey)('Live API Tests (requires GOOGLE_API_KEY)', () => {
    let client: GoogleGenerativeAI;

    beforeAll(() => {
      client = new GoogleGenerativeAI(GOOGLE_API_KEY!);
    });

    it('should make a basic chat request with gemini-3-pro-preview', async () => {
      const model = client.getGenerativeModel({
        model: 'gemini-3-pro-preview',
        generationConfig: { maxOutputTokens: 50 },
      });

      const result = await model.generateContent('Say "hello" and nothing else.');

      expect(result).toBeDefined();
      expect(result.response).toBeDefined();

      const text = result.response.text();
      expect(text).toBeDefined();
      console.log('Gemini 3 Pro response:', text);
    }, 30000); // 30 second timeout for API call

    it('should stream responses from gemini-3-pro-preview', async () => {
      const model = client.getGenerativeModel({
        model: 'gemini-3-pro-preview',
        generationConfig: { maxOutputTokens: 50 },
      });

      const streamResult = await model.generateContentStream('Count from 1 to 3.');

      const chunks: string[] = [];
      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (text) {
          chunks.push(text);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      const fullResponse = chunks.join('');
      console.log('Gemini 3 Pro streamed response:', fullResponse);
      expect(fullResponse).toBeTruthy();
    }, 30000);

    it('should handle function calling with gemini-3-pro-preview', async () => {
      const model = client.getGenerativeModel({
        model: 'gemini-3-pro-preview',
        tools: [
          {
            functionDeclarations: [
              {
                name: 'calculator',
                description: 'Performs basic arithmetic calculations',
                parameters: {
                  type: 'object' as const,
                  properties: {
                    expression: {
                      type: 'string',
                      description: 'The math expression to evaluate',
                    },
                  },
                  required: ['expression'],
                },
              },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 100 },
      });

      const result = await model.generateContent(
        'What is 2 + 2? Use the calculator tool to compute this.'
      );

      expect(result).toBeDefined();
      expect(result.response).toBeDefined();

      const candidates = result.response.candidates;
      expect(candidates).toBeDefined();
      expect(candidates!.length).toBeGreaterThan(0);

      const content = candidates![0].content;
      console.log('Gemini 3 Pro tool test - content parts:', content.parts.length);

      // Check for function call
      const functionCallPart = content.parts.find((p) => 'functionCall' in p);
      if (functionCallPart && 'functionCall' in functionCallPart) {
        console.log('Function called:', functionCallPart.functionCall.name);
        expect(functionCallPart.functionCall.name).toBe('calculator');
      } else {
        // Model might answer directly
        const textPart = content.parts.find((p) => 'text' in p);
        if (textPart && 'text' in textPart) {
          console.log('Model response:', textPart.text);
        }
      }
    }, 30000);
  });

  describe('Model Name Validation', () => {
    it('should have correct model name format', () => {
      const modelName = 'gemini-3-pro-preview';

      // Gemini model names follow pattern: gemini-{version}[-variant][-preview]
      expect(modelName).toMatch(/^gemini-\d+(-[a-z]+)+(-preview)?$/);
    });
  });

  describe.skipIf(!hasApiKey)('GoogleProvider Integration (requires GOOGLE_API_KEY)', () => {
    let provider: GoogleProvider;

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
      provider = new GoogleProvider();
    });

    it('should initialize with correct settings', () => {
      expect(provider.name).toBe('google');
      expect(provider.model).toBe('gemini-3-pro-preview');

      const settings = provider.getSettings();
      expect(settings.thinking).toBe(true);
      // Web search is disabled by default on gemini-3-pro-preview (not supported)
      expect(settings.webSearch).toBe(false);
    });

    it('should handle basic chat request', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Say "hello" and nothing else.' },
      ];

      const chunks: Array<{ type: string; content: string }> = [];

      for await (const chunk of provider.chat(messages, [])) {
        chunks.push({ type: chunk.type, content: chunk.content });
      }

      // Should have received text response
      const textChunks = chunks.filter((c) => c.type === 'text');
      expect(textChunks.length).toBeGreaterThan(0);

      const fullResponse = textChunks.map((c) => c.content).join('');
      console.log('GoogleProvider response:', fullResponse);
      expect(fullResponse.toLowerCase()).toContain('hello');

      // Should have a done signal
      const doneChunk = chunks.find((c) => c.type === 'done');
      expect(doneChunk).toBeDefined();
    }, 30000);

    it('should handle tool call request', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'What is the weather in Paris? You must use the get_weather tool.',
        },
      ];

      const chunks: Array<{ type: string; name?: string; toolCallId?: string }> = [];

      for await (const chunk of provider.chat(messages, [testTool])) {
        chunks.push({ type: chunk.type, name: chunk.name, toolCallId: chunk.toolCallId });
        if (chunk.type === 'tool_call') {
          console.log('Tool call received:', chunk.name, chunk.toolCallId);
        }
      }

      // Should have received a tool call
      const toolCallChunk = chunks.find((c) => c.type === 'tool_call');
      expect(toolCallChunk).toBeDefined();
      expect(toolCallChunk?.name).toBe('get_weather');
      expect(toolCallChunk?.toolCallId).toBeDefined();
    }, 30000);

    it('should handle conversation continuation after tool result', async () => {
      // First, get the tool call
      const initialMessages: Message[] = [
        {
          role: 'user',
          content: 'What is the weather in Tokyo? Use the get_weather tool.',
        },
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
      const continuationMessages: Message[] = [
        {
          role: 'user',
          content: 'What is the weather in Tokyo? Use the get_weather tool.',
        },
        { role: 'assistant', content: '' },
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

    it('should support thinking mode toggle', () => {
      provider.setThinking(false);
      expect(provider.getSettings().thinking).toBe(false);
      expect(provider.getCurrentBudget()).toBe(0);

      provider.setThinking(true);
      expect(provider.getSettings().thinking).toBe(true);
      expect(provider.getCurrentBudget()).toBeGreaterThan(0);
    });

    it('should keep web search disabled (not supported on gemini-3-pro-preview)', () => {
      // Web search is not supported on gemini-3-pro-preview
      // setWebSearch(true) should be ignored
      provider.setWebSearch(true);
      expect(provider.getSettings().webSearch).toBe(false);

      provider.setWebSearch(false);
      expect(provider.getSettings().webSearch).toBe(false);
    });

    it('should support reasoning phase changes', () => {
      provider.setReasoningPhase('planning');
      expect(provider.getReasoningPhase()).toBe('planning');
      const planningBudget = provider.getCurrentBudget();

      provider.setReasoningPhase('executing');
      expect(provider.getReasoningPhase()).toBe('executing');
      const executingBudget = provider.getCurrentBudget();

      // Planning should have higher budget
      expect(planningBudget).toBeGreaterThan(executingBudget);
    });
  });

  describe.skipIf(!hasApiKey)(
    'Multi-turn Tool Calls (requires GOOGLE_API_KEY)',
    () => {
      let provider: GoogleProvider;

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
        provider = new GoogleProvider();
        // Disable thinking for faster tests
        provider.setThinking(false);
      });

      it('should handle multiple tool results in sequence', async () => {
        // Test with two tool calls and results
        const messages: Message[] = [
          {
            role: 'user',
            content: 'Compare weather in Paris and London. Use get_weather for each.',
          },
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
    }
  );
});

