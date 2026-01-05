import type { Tool, AIModelId } from '@chess/shared';
import { AnthropicProvider, AVAILABLE_MODELS } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GoogleProvider } from './google.js';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
  toolArguments?: Record<string, unknown>; // Original tool arguments for reconstructing Anthropic messages
  thinking?: string; // Extended thinking content for Anthropic (must be preserved for tool use continuation)
  thinkingSignature?: string; // Encrypted signature for thinking block
  rawPart?: Record<string, unknown>; // Raw Gemini part with thought_signature for multi-turn tool use
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'thinking_signature' | 'done';
  content: string;
  name?: string;
  arguments?: Record<string, unknown>;
  toolCallId?: string;
  rawPart?: Record<string, unknown>; // Raw Gemini part for preserving thought_signature
}

export type ReasoningPhase = 'planning' | 'executing';

export interface AIProvider {
  name: string;
  model: string;
  chat(messages: Message[], tools: Tool[]): AsyncGenerator<StreamChunk>;
  setModel?(modelId: AIModelId): void;
  setThinking?(enabled: boolean): void;
  setWebSearch?(enabled: boolean): void;
  setReasoningPhase?(phase: ReasoningPhase): void;
  getCurrentBudget?(): number;
  getReasoningPhase?(): ReasoningPhase;
  getSettings?(): { thinking: boolean; webSearch: boolean };
}

export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || 'anthropic';

  switch (provider.toLowerCase()) {
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY not set, falling back to Anthropic');
        return new AnthropicProvider();
      }
      return new OpenAIProvider();
    case 'anthropic':
    default:
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('ANTHROPIC_API_KEY not set');
      }
      return new AnthropicProvider();
  }
}

export { AnthropicProvider, OpenAIProvider, GoogleProvider, AVAILABLE_MODELS };

