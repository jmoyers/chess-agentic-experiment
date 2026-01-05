import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ToolResultBlockParam, ToolUseBlockParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs';
import type { Tool, AIModelId, AIModel } from '@chess/shared';
import type { AIProvider, Message, StreamChunk, ReasoningPhase } from './index.js';
import { agentLog } from '../../utils/logger.js';

// Type for thinking block (extended thinking)
interface ThinkingBlockParam {
  type: 'thinking';
  thinking: string;
  signature: string;
}

// Type for assistant message content blocks (including thinking for extended thinking mode)
type AssistantContentBlock = TextBlockParam | ToolUseBlockParam | ThinkingBlockParam;

// Available models with their API identifiers
export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    description: 'Fast, efficient model for most tasks',
    apiModel: 'claude-sonnet-4-20250514',
  },
  {
    id: 'claude-opus-4.5',
    name: 'Claude Opus 4.5',
    description: 'Most capable model for complex reasoning',
    apiModel: 'claude-opus-4-5-20251101',
  },
  {
    id: 'chatgpt-5.2',
    name: 'ChatGPT 5.2',
    description: 'OpenAI\'s latest model',
    apiModel: 'gpt-5.2',
  },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    description: 'Google\'s most intelligent multimodal model',
    apiModel: 'gemini-3-pro-preview',
  },
];

export function getApiModelName(modelId: AIModelId): string {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  return model?.apiModel || AVAILABLE_MODELS[0].apiModel;
}

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  enableThinking?: boolean;
  enableWebSearch?: boolean;
}

// Extended thinking budget tokens - adaptive based on reasoning phase
const PLANNING_BUDGET_TOKENS = 32000; // High budget for initial planning
const EXECUTING_BUDGET_TOKENS = 10000; // Lower budget for execution iterations
// Max tokens must be greater than thinking budget
const MAX_TOKENS_PLANNING = 48000;
const MAX_TOKENS_EXECUTING = 24000;
const MAX_TOKENS_WITHOUT_THINKING = 8192;

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  model: string;
  private client: Anthropic;
  private enableThinking: boolean;
  private enableWebSearch: boolean;
  private reasoningPhase: ReasoningPhase = 'planning';

  constructor(options: AnthropicProviderOptions = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
    });
    // Default to Opus 4.5 with thinking and web search enabled for best experience
    this.model = options.model || process.env.ANTHROPIC_MODEL || 'claude-opus-4-5-20251101';
    this.enableThinking = options.enableThinking ?? true;
    this.enableWebSearch = options.enableWebSearch ?? true;
    agentLog.ai('anthropic', 'INITIALIZED', { 
      model: this.model, 
      enableThinking: this.enableThinking, 
      thinkingBudget: this.enableThinking ? PLANNING_BUDGET_TOKENS : 0,
      enableWebSearch: this.enableWebSearch 
    });
  }

  setModel(modelId: AIModelId): void {
    this.model = getApiModelName(modelId);
    agentLog.ai('anthropic', 'MODEL CHANGED', { modelId, apiModel: this.model });
  }

  setThinking(enabled: boolean): void {
    this.enableThinking = enabled;
    agentLog.ai('anthropic', 'THINKING MODE', { 
      enabled, 
      budgetTokens: enabled ? this.getCurrentBudget() : 0 
    });
  }

  setWebSearch(enabled: boolean): void {
    this.enableWebSearch = enabled;
    agentLog.ai('anthropic', 'WEB SEARCH MODE', { enabled });
  }

  /**
   * Set the reasoning phase - affects token budget allocation
   * @param phase 'planning' for high budget, 'executing' for lower budget
   */
  setReasoningPhase(phase: ReasoningPhase): void {
    this.reasoningPhase = phase;
    agentLog.ai('anthropic', 'REASONING PHASE', { 
      phase, 
      budgetTokens: this.getCurrentBudget() 
    });
  }

  /**
   * Get the current thinking budget based on reasoning phase
   */
  getCurrentBudget(): number {
    if (!this.enableThinking) return 0;
    return this.reasoningPhase === 'planning' 
      ? PLANNING_BUDGET_TOKENS 
      : EXECUTING_BUDGET_TOKENS;
  }

  /**
   * Get the current reasoning phase
   */
  getReasoningPhase(): ReasoningPhase {
    return this.reasoningPhase;
  }

  getSettings(): { thinking: boolean; webSearch: boolean } {
    return {
      thinking: this.enableThinking,
      webSearch: this.enableWebSearch,
    };
  }

  async *chat(messages: Message[], tools: Tool[]): AsyncGenerator<StreamChunk> {
    const systemMessage = messages.find((m) => m.role === 'system');
    
    // Convert messages to Anthropic format, handling tool results properly
    const chatMessages = this.convertMessages(messages.filter((m) => m.role !== 'system'));

    // Convert tools to Anthropic format
    const anthropicTools: Array<{
      name: string;
      description: string;
      input_schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
      };
    } | {
      type: 'web_search_20250305';
      name: 'web_search';
      max_uses?: number;
    }> = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required || [],
      },
    }));

    // Add web search tool if enabled
    if (this.enableWebSearch) {
      anthropicTools.push({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      });
    }

    // Configure max_tokens based on thinking mode and reasoning phase
    const thinkingBudget = this.getCurrentBudget();
    const maxTokens = this.enableThinking 
      ? (this.reasoningPhase === 'planning' ? MAX_TOKENS_PLANNING : MAX_TOKENS_EXECUTING)
      : MAX_TOKENS_WITHOUT_THINKING;

    agentLog.ai('anthropic', 'API REQUEST', {
      model: this.model,
      messageCount: chatMessages.length,
      toolCount: anthropicTools.length,
      hasSystem: !!systemMessage,
      webSearchEnabled: this.enableWebSearch,
      thinkingEnabled: this.enableThinking,
      reasoningPhase: this.reasoningPhase,
      thinkingBudget,
      maxTokens,
    });

    try {
      // Build request with optional extended thinking
      const requestParams: Parameters<typeof this.client.messages.stream>[0] = {
        model: this.model,
        max_tokens: maxTokens,
        system: systemMessage?.content || '',
        messages: chatMessages,
        tools: anthropicTools.length > 0 ? anthropicTools as any : undefined,
      };

      // Add extended thinking configuration when enabled
      // Per Anthropic docs: thinking: { type: "enabled", budget_tokens: N }
      // Budget is dynamic based on reasoning phase (planning vs executing)
      if (this.enableThinking) {
        (requestParams as any).thinking = {
          type: 'enabled',
          budget_tokens: thinkingBudget,
        };
      }

      const stream = this.client.messages.stream(requestParams);

      let eventCount = 0;
      let textChunks = 0;
      let thinkingChunks = 0;
      let toolCallsFound = 0;

      for await (const event of stream) {
        eventCount++;
        
        if (event.type === 'content_block_delta') {
          const delta = event.delta as any;
          if (delta.type === 'thinking_delta' && 'thinking' in delta) {
            // Extended thinking content streaming
            thinkingChunks++;
            yield {
              type: 'thinking',
              content: delta.thinking,
            };
          } else if (delta.type === 'signature_delta' && 'signature' in delta) {
            // Thinking signature - must be preserved for multi-turn with tool use
            yield {
              type: 'thinking_signature',
              content: delta.signature,
            };
          } else if (delta.type === 'text_delta' && 'text' in delta) {
            textChunks++;
            yield {
              type: 'text',
              content: delta.text,
            };
          } else if ('text' in delta) {
            // Fallback for older format
            textChunks++;
            yield {
              type: 'text',
              content: delta.text,
            };
          } else if ('partial_json' in delta) {
            // Tool call in progress, we'll handle it at the end
          }
        } else if (event.type === 'content_block_start') {
          const block = event.content_block as any;
          if (block.type === 'thinking') {
            agentLog.ai('anthropic', 'THINKING BLOCK START');
          } else if (block.type === 'tool_use') {
            agentLog.ai('anthropic', 'TOOL_USE BLOCK START', { toolName: block.name });
          }
        } else if (event.type === 'message_delta') {
          agentLog.ai('anthropic', 'MESSAGE DELTA', { 
            stopReason: event.delta.stop_reason,
            usage: event.usage 
          });
          
          if (event.delta.stop_reason === 'tool_use') {
            // Get the final message to extract tool calls
            const finalMessage = await stream.finalMessage();
            for (const block of finalMessage.content) {
              if (block.type === 'tool_use') {
                toolCallsFound++;
                const toolInput = block.input as Record<string, unknown>;
                agentLog.ai('anthropic', 'TOOL CALL EXTRACTED', { 
                  name: block.name, 
                  id: block.id,
                  hasInput: Object.keys(toolInput).length > 0,
                  inputKeys: Object.keys(toolInput),
                });
                yield {
                  type: 'tool_call',
                  content: '',
                  name: block.name,
                  arguments: toolInput,
                  toolCallId: block.id,
                };
              }
            }
          }
        }
      }

      agentLog.ai('anthropic', 'STREAM COMPLETE', {
        events: eventCount,
        thinkingChunks,
        textChunks,
        toolCalls: toolCallsFound,
      });

      yield { type: 'done', content: '' };
    } catch (error) {
      agentLog.error('Anthropic API', error);
      yield {
        type: 'text',
        content: 'I encountered an error processing your request. Please try again.',
      };
      yield { type: 'done', content: '' };
    }
  }

  /**
   * Convert messages to Anthropic format, properly handling tool results.
   * 
   * Anthropic API requires tool results to be formatted as:
   * - Assistant message with tool_use content blocks
   * - User message with tool_result content blocks
   */
  private convertMessages(messages: Message[]): MessageParam[] {
    const result: MessageParam[] = [];
    let i = 0;

    while (i < messages.length) {
      const msg = messages[i];

      if (msg.role === 'user') {
        result.push({
          role: 'user',
          content: msg.content,
        });
        i++;
      } else if (msg.role === 'assistant') {
        // Check if the next message is a tool result
        const nextMsg = messages[i + 1];
        if (nextMsg && nextMsg.role === 'tool' && nextMsg.toolCallId) {
          // Collect all consecutive tool results
          const toolResults: ToolResultBlockParam[] = [];
          const toolUseBlocks: ToolUseBlockParam[] = [];
          
          // First, add the assistant message with tool_use blocks
          let j = i + 1;
          while (j < messages.length && messages[j].role === 'tool') {
            const toolMsg = messages[j];
            if (toolMsg.toolCallId && toolMsg.name) {
              // Reconstruct the tool_use block with original arguments
              toolUseBlocks.push({
                type: 'tool_use',
                id: toolMsg.toolCallId,
                name: toolMsg.name,
                input: toolMsg.toolArguments || {}, // Use stored arguments for proper reconstruction
              });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolMsg.toolCallId,
                content: toolMsg.content,
              });
            }
            j++;
          }

          // Add assistant message with tool_use blocks (and any text content)
          // Per Anthropic docs: When thinking is enabled, assistant messages must start with thinking block
          const assistantContent: AssistantContentBlock[] = [];
          
          // Add thinking block first if present (required for extended thinking with tool use)
          if (msg.thinking && msg.thinkingSignature) {
            assistantContent.push({
              type: 'thinking',
              thinking: msg.thinking,
              signature: msg.thinkingSignature,
            });
          }
          
          if (msg.content) {
            assistantContent.push({ type: 'text', text: msg.content });
          }
          assistantContent.push(...toolUseBlocks);
          
          result.push({
            role: 'assistant',
            // Cast to any because SDK types don't include thinking blocks yet
            content: assistantContent as any,
          });

          // Add user message with tool_result blocks
          result.push({
            role: 'user',
            content: toolResults,
          });

          i = j; // Skip past all the tool messages
        } else {
          // Regular assistant message
          result.push({
            role: 'assistant',
            content: msg.content,
          });
          i++;
        }
      } else if (msg.role === 'tool') {
        // Orphan tool message (shouldn't happen with proper sequencing)
        // Convert to user message with tool_result
        if (msg.toolCallId) {
          result.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: msg.toolCallId,
              content: msg.content,
            }],
          });
        }
        i++;
      } else {
        i++;
      }
    }

    return result;
  }
}

