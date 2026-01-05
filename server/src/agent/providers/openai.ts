import OpenAI from 'openai';
import type { Tool, AIModelId } from '@chess/shared';
import type { AIProvider, Message, StreamChunk, ReasoningPhase } from './index.js';

// Extended thinking budget tokens - adaptive based on reasoning phase
const PLANNING_BUDGET_TOKENS = 32000; // High budget for initial planning
const EXECUTING_BUDGET_TOKENS = 10000; // Lower budget for execution iterations

/**
 * OpenAI Provider using the Responses API
 *
 * The Responses API supports both web search AND function calling together,
 * unlike Chat Completions which requires separate search models that don't support tools.
 */
export class OpenAIProvider implements AIProvider {
  name = 'openai';
  model = 'gpt-5.2';
  private client: OpenAI;
  private maxTokens = 16384;
  private enableWebSearch = true;
  private enableThinking = true;
  private reasoningPhase: ReasoningPhase = 'planning';

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  setModel(modelId: AIModelId): void {
    if (modelId === 'chatgpt-5.2') {
      this.model = 'gpt-5.2';
    } else {
      console.log(`OpenAI provider: model ${modelId} not recognized, keeping ${this.model}`);
    }
  }

  setThinking(enabled: boolean): void {
    this.enableThinking = enabled;
    console.log(
      `OpenAI reasoning: ${
        enabled ? 'high effort' : 'disabled'
      }, budget: ${this.getCurrentBudget()}k`
    );
  }

  setWebSearch(enabled: boolean): void {
    this.enableWebSearch = enabled;
    console.log(`OpenAI web search: ${enabled}`);
  }

  /**
   * Set the reasoning phase - affects token budget allocation
   * @param phase 'planning' for high budget, 'executing' for lower budget
   */
  setReasoningPhase(phase: ReasoningPhase): void {
    this.reasoningPhase = phase;
    console.log(`OpenAI reasoning phase: ${phase}, budget: ${this.getCurrentBudget()}`);
  }

  /**
   * Get the current thinking budget based on reasoning phase
   */
  getCurrentBudget(): number {
    if (!this.enableThinking) return 0;
    return this.reasoningPhase === 'planning' ? PLANNING_BUDGET_TOKENS : EXECUTING_BUDGET_TOKENS;
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

  /**
   * Convert our message format to OpenAI Responses API input format
   *
   * For multi-turn with tool calls, we include:
   * - function_call items (representing what the assistant called)
   * - function_call_output items (representing the results)
   */
  private buildInput(messages: Message[]): Array<any> {
    const input: Array<any> = [];
    let i = 0;

    while (i < messages.length) {
      const msg = messages[i];

      if (msg.role === 'system') {
        input.push({
          type: 'message',
          role: 'system',
          content: msg.content,
        });
        i++;
      } else if (msg.role === 'user') {
        input.push({
          type: 'message',
          role: 'user',
          content: msg.content,
        });
        i++;
      } else if (msg.role === 'assistant') {
        // Check if followed by tool results
        const toolResults: Message[] = [];
        let j = i + 1;
        while (j < messages.length && messages[j].role === 'tool') {
          toolResults.push(messages[j]);
          j++;
        }

        if (toolResults.length > 0) {
          // Add assistant's text content if present
          if (msg.content) {
            input.push({
              type: 'message',
              role: 'assistant',
              content: msg.content,
            });
          }

          // Add function calls and their outputs
          for (const tr of toolResults) {
            const callId = tr.toolCallId || `call_${i}_${toolResults.indexOf(tr)}`;

            // Add the function call the assistant made
            input.push({
              type: 'function_call',
              call_id: callId,
              name: tr.name || 'unknown',
              arguments: JSON.stringify(tr.toolArguments || {}),
            });

            // Add the function call output/result
            input.push({
              type: 'function_call_output',
              call_id: callId,
              output: tr.content,
            });
          }

          i = j;
        } else {
          // Regular assistant message without tool calls
          input.push({
            type: 'message',
            role: 'assistant',
            content: msg.content,
          });
          i++;
        }
      } else if (msg.role === 'tool') {
        // Orphan tool result - shouldn't happen but handle it
        input.push({
          type: 'function_call_output',
          call_id: msg.toolCallId || '',
          output: msg.content,
        });
        i++;
      } else {
        i++;
      }
    }

    return input;
  }

  /**
   * Recursively transform a JSON schema for OpenAI strict mode.
   * Strict mode requires:
   * - additionalProperties: false on ALL objects
   * - required array containing ALL property names for each object
   */
  private makeStrictSchema(schema: Record<string, any>): Record<string, any> {
    if (!schema || typeof schema !== 'object') return schema;

    const result: Record<string, any> = { ...schema };

    // If this is an object type, add strict mode requirements
    if (schema.type === 'object' && schema.properties) {
      result.additionalProperties = false;
      result.required = Object.keys(schema.properties);

      // Recursively process each property
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result.properties[key] = this.makeStrictSchema(value as Record<string, any>);
      }
    }

    // If this is an array type, process the items schema
    if (schema.type === 'array' && schema.items) {
      result.items = this.makeStrictSchema(schema.items);
    }

    return result;
  }

  async *chat(messages: Message[], tools: Tool[]): AsyncGenerator<StreamChunk> {
    // Build tools array with web search + function tools
    // Using 'any' because the OpenAI SDK types don't fully cover all tool types
    const openaiTools: Array<any> = [];

    // Add web search tool if enabled
    if (this.enableWebSearch) {
      openaiTools.push({
        type: 'web_search',
      });
    }

    // Add function tools with strict schema enforcement
    for (const tool of tools) {
      const strictParameters = this.makeStrictSchema({
        type: 'object',
        properties: tool.parameters.properties,
      });

      openaiTools.push({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: strictParameters,
        strict: true,
      });
    }

    // Build input from messages
    const input = this.buildInput(messages);

    // Emit initial thinking status if thinking is enabled
    if (this.enableThinking) {
      const phaseHint =
        this.reasoningPhase === 'planning'
          ? 'Analyzing position and planning approach...'
          : 'Executing plan...';
      yield {
        type: 'thinking',
        content: phaseHint,
      };
    }

    try {
      // Use streaming with Responses API
      // Only include reasoning config when extended thinking is enabled (high effort)
      const stream = await this.client.responses.create({
        model: this.model,
        input,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        stream: true,
        max_output_tokens: this.maxTokens,
        ...(this.enableThinking && { reasoning: { effort: 'high' as const } }),
      });

      let currentFunctionCall: {
        id: string;
        callId: string;
        name: string;
        arguments: string;
      } | null = null;
      let hasEmittedContent = false;

      for await (const event of stream) {
        // Handle different event types from Responses API streaming
        if (event.type === 'response.output_text.delta') {
          // Text content streaming - end thinking phase
          if (!hasEmittedContent && this.enableThinking) {
            yield { type: 'thinking', content: '\nForming response...' };
            hasEmittedContent = true;
          }
          yield {
            type: 'text',
            content: event.delta || '',
          };
        } else if (event.type === 'response.function_call_arguments.delta') {
          // Function call arguments streaming
          if (currentFunctionCall) {
            currentFunctionCall.arguments += event.delta || '';
          }
        } else if (event.type === 'response.output_item.added') {
          // New output item started
          const item = event.item;
          if (item?.type === 'function_call') {
            currentFunctionCall = {
              id: item.id || '',
              callId: item.call_id || item.id || '',
              name: item.name || '',
              arguments: item.arguments || '',
            };
            // Emit thinking hint for function call
            if (this.enableThinking) {
              yield {
                type: 'thinking',
                content: `\nConsidering ${this.formatToolNameForThinking(item.name || '')}...`,
              };
            }
          }
        } else if (event.type === 'response.output_item.done') {
          // Output item completed
          const item = event.item;
          if (item?.type === 'function_call' && currentFunctionCall) {
            yield {
              type: 'tool_call',
              content: '',
              name: currentFunctionCall.name,
              arguments: JSON.parse(currentFunctionCall.arguments || '{}'),
              toolCallId: currentFunctionCall.callId,
            };
            currentFunctionCall = null;
          }
        } else if (event.type === 'response.completed') {
          // Response fully completed
          break;
        }
      }

      yield { type: 'done', content: '' };
    } catch (error) {
      console.error('OpenAI Responses API error:', error);
      yield {
        type: 'text',
        content: 'I encountered an error processing your request. Please try again.',
      };
      yield { type: 'done', content: '' };
    }
  }

  /**
   * Format tool names for human-readable thinking display
   */
  private formatToolNameForThinking(name: string): string {
    const toolLabels: Record<string, string> = {
      lookup_opening: 'opening lookup',
      list_openings: 'opening list',
      get_position_stats: 'position statistics',
      get_current_position: 'current position',
      reset_board: 'board reset',
      make_move: 'making a move',
      make_moves: 'move sequence',
      undo_moves: 'undoing moves',
      goto_move: 'move navigation',
      set_position: 'position setup',
      draw_arrows: 'visual annotations',
      highlight_squares: 'square highlights',
      clear_annotations: 'clearing annotations',
      analyze_position: 'engine analysis',
      analyze_line: 'line analysis',
      explore_continuations: 'exploring continuations',
      ask_multiple_choice: 'asking a question',
      web_search: 'searching the web',
    };
    return toolLabels[name] || name.replace(/_/g, ' ');
  }
}
