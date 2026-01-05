import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type Part,
  type Tool as GoogleTool,
  type FunctionCall,
  type GenerationConfig,
  SchemaType,
  type FunctionDeclarationSchemaProperty,
} from '@google/generative-ai';
import type { Tool, AIModelId } from '@chess/shared';
import type { AIProvider, Message, StreamChunk, ReasoningPhase } from './index.js';
import { agentLog } from '../../utils/logger.js';

// Extended thinking budget tokens - adaptive based on reasoning phase
const PLANNING_BUDGET_TOKENS = 32000; // High budget for initial planning
const EXECUTING_BUDGET_TOKENS = 10000; // Lower budget for execution iterations

/**
 * Google Gemini Provider using the Generative AI SDK
 *
 * Supports function calling and thinking mode.
 * Based on gemini-3-pro-preview model.
 * 
 * Note: Web search (googleSearchRetrieval) is NOT supported on gemini-3-pro-preview.
 * The API returns: "google_search_retrieval is not supported. Please use google_search tool instead."
 * However, the google_search tool format is not yet available in the SDK.
 * Web search is disabled by default for this provider.
 */
export class GoogleProvider implements AIProvider {
  name = 'google';
  model = 'gemini-3-pro-preview';
  private client: GoogleGenerativeAI;
  private maxOutputTokens = 65536;
  // Web search is disabled by default - googleSearchRetrieval not supported on gemini-3-pro-preview
  private enableWebSearch = false;
  private enableThinking = true;
  private reasoningPhase: ReasoningPhase = 'planning';

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is required');
    }
    this.client = new GoogleGenerativeAI(apiKey);

    agentLog.ai('google', 'INITIALIZED', {
      model: this.model,
      enableThinking: this.enableThinking,
      enableWebSearch: this.enableWebSearch,
    });
  }

  setModel(modelId: AIModelId): void {
    if (modelId === 'gemini-3-pro') {
      this.model = 'gemini-3-pro-preview';
    } else {
      console.log(`Google provider: model ${modelId} not recognized, keeping ${this.model}`);
    }
    agentLog.ai('google', 'MODEL CHANGED', { modelId, apiModel: this.model });
  }

  setThinking(enabled: boolean): void {
    this.enableThinking = enabled;
    agentLog.ai('google', 'THINKING MODE', {
      enabled,
      budgetTokens: enabled ? this.getCurrentBudget() : 0,
    });
  }

  setWebSearch(enabled: boolean): void {
    // Web search (googleSearchRetrieval) is not supported on gemini-3-pro-preview
    // The API requires the "google_search" tool format which isn't available in the SDK yet
    if (enabled) {
      agentLog.ai('google', 'WEB SEARCH NOT SUPPORTED', {
        message: 'googleSearchRetrieval is not supported on gemini-3-pro-preview, keeping disabled',
      });
      // Keep disabled - don't actually enable it
      return;
    }
    this.enableWebSearch = false;
    agentLog.ai('google', 'WEB SEARCH MODE', { enabled: false });
  }

  /**
   * Set the reasoning phase - affects token budget allocation
   * @param phase 'planning' for high budget, 'executing' for lower budget
   */
  setReasoningPhase(phase: ReasoningPhase): void {
    this.reasoningPhase = phase;
    agentLog.ai('google', 'REASONING PHASE', {
      phase,
      budgetTokens: this.getCurrentBudget(),
    });
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
      // Always return false - web search not supported on gemini-3-pro-preview
      webSearch: false,
    };
  }

  /**
   * Convert our messages format to Google Gemini Content format
   */
  private buildContents(messages: Message[]): { systemInstruction: string; contents: Content[] } {
    const contents: Content[] = [];
    let systemInstruction = '';

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];

      if (msg.role === 'system') {
        // System message becomes systemInstruction
        systemInstruction = msg.content;
        i++;
      } else if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
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
          // Assistant message with function calls
          const parts: Part[] = [];

          // Add text content if present
          if (msg.content) {
            parts.push({ text: msg.content });
          }

          // Add function calls - use raw parts if available to preserve thought_signature
          // Gemini 3 Pro requires thought_signature in functionCall parts for multi-turn
          for (const tr of toolResults) {
            if (tr.rawPart) {
              // Use the raw part which includes thought_signature
              parts.push(tr.rawPart as unknown as Part);
            } else {
              // Fallback: reconstruct without signature (may fail on Gemini 3 Pro)
              parts.push({
                functionCall: {
                  name: tr.name || 'unknown',
                  args: (tr.toolArguments || {}) as object,
                },
              });
            }
          }

          contents.push({
            role: 'model',
            parts,
          });

          // Add function responses as user message (Gemini convention)
          const responseParts: Part[] = toolResults.map((tr) => ({
            functionResponse: {
              name: tr.name || 'unknown',
              response: this.parseToolContent(tr.content),
            },
          }));

          contents.push({
            role: 'user',
            parts: responseParts,
          });

          i = j;
        } else {
          // Regular assistant message
          contents.push({
            role: 'model',
            parts: [{ text: msg.content }],
          });
          i++;
        }
      } else if (msg.role === 'tool') {
        // Orphan tool result - shouldn't happen but handle it
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'unknown',
                response: this.parseToolContent(msg.content),
              },
            },
          ],
        });
        i++;
      } else {
        i++;
      }
    }

    return { systemInstruction, contents };
  }

  /**
   * Parse tool content - try JSON parse, fallback to wrapped object
   */
  private parseToolContent(content: string): object {
    try {
      return JSON.parse(content);
    } catch {
      return { result: content };
    }
  }

  /**
   * Convert our Tool format to Google Gemini FunctionDeclaration format
   * 
   * Note: Web search (googleSearchRetrieval) is NOT included because
   * gemini-3-pro-preview doesn't support it. The API requires "google_search"
   * tool format which isn't available in the SDK yet.
   */
  private convertTools(tools: Tool[]): GoogleTool[] {
    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: this.convertProperties(tool.parameters.properties),
        required: tool.parameters.required || [],
      },
    }));

    return [{ functionDeclarations }];
  }

  /**
   * Convert tool parameter properties to Gemini schema format
   */
  private convertProperties(
    props: Record<string, unknown>
  ): Record<string, FunctionDeclarationSchemaProperty> {
    const result: Record<string, FunctionDeclarationSchemaProperty> = {};

    for (const [key, value] of Object.entries(props)) {
      const prop = value as {
        type: string;
        description?: string;
        enum?: string[];
        items?: unknown;
      };

      const schemaType = this.mapType(prop.type);

      if (schemaType === SchemaType.ARRAY && prop.items) {
        // Handle array type - items schema must be a valid Schema type
        const itemsProp = prop.items as { 
          type?: string; 
          description?: string;
          properties?: Record<string, unknown>;
          required?: string[];
        };
        const itemType = this.mapType(itemsProp.type || 'string');

        // Build a valid schema for items based on the type
        let itemsSchema: FunctionDeclarationSchemaProperty;
        if (itemType === SchemaType.OBJECT && itemsProp.properties) {
          // Handle nested object schemas (e.g., array of arrows with from/to/color)
          itemsSchema = { 
            type: SchemaType.OBJECT, 
            description: itemsProp.description,
            properties: this.convertProperties(itemsProp.properties),
            required: itemsProp.required || [],
          };
        } else if (itemType === SchemaType.STRING) {
          itemsSchema = { type: SchemaType.STRING, description: itemsProp.description };
        } else if (itemType === SchemaType.NUMBER) {
          itemsSchema = { type: SchemaType.NUMBER, description: itemsProp.description };
        } else if (itemType === SchemaType.INTEGER) {
          itemsSchema = { type: SchemaType.INTEGER, description: itemsProp.description };
        } else if (itemType === SchemaType.BOOLEAN) {
          itemsSchema = { type: SchemaType.BOOLEAN, description: itemsProp.description };
        } else {
          // Default to string for complex/unknown types
          itemsSchema = { type: SchemaType.STRING, description: itemsProp.description };
        }

        result[key] = {
          type: SchemaType.ARRAY,
          description: prop.description,
          items: itemsSchema,
        };
      } else if (schemaType === SchemaType.STRING && prop.enum) {
        // Handle enum type
        result[key] = {
          type: SchemaType.STRING,
          description: prop.description,
          format: 'enum',
          enum: prop.enum,
        } as FunctionDeclarationSchemaProperty;
      } else {
        // Handle basic types
        result[key] = {
          type: schemaType,
          description: prop.description,
        } as FunctionDeclarationSchemaProperty;
      }
    }

    return result;
  }

  /**
   * Map JSON Schema types to Gemini SchemaType
   */
  private mapType(type: string): SchemaType {
    const typeMap: Record<string, SchemaType> = {
      string: SchemaType.STRING,
      number: SchemaType.NUMBER,
      integer: SchemaType.INTEGER,
      boolean: SchemaType.BOOLEAN,
      array: SchemaType.ARRAY,
      object: SchemaType.OBJECT,
    };
    return typeMap[type] || SchemaType.STRING;
  }

  async *chat(messages: Message[], tools: Tool[]): AsyncGenerator<StreamChunk> {
    const { systemInstruction, contents } = this.buildContents(messages);

    // Build tools array
    const geminiTools = this.convertTools(tools);

    // Build generation config
    const generationConfig: GenerationConfig = {
      maxOutputTokens: this.maxOutputTokens,
    };

    agentLog.ai('google', 'API REQUEST', {
      model: this.model,
      messageCount: contents.length,
      toolCount: tools.length,
      hasSystem: !!systemInstruction,
      webSearchEnabled: this.enableWebSearch,
      thinkingEnabled: this.enableThinking,
      reasoningPhase: this.reasoningPhase,
      thinkingBudget: this.getCurrentBudget(),
    });

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
      // Get generative model with configuration
      const model = this.client.getGenerativeModel({
        model: this.model,
        tools: geminiTools,
        generationConfig,
        systemInstruction: systemInstruction || undefined,
      });

      // Use streaming with Gemini
      const streamResult = await model.generateContentStream({
        contents,
      });

      let textChunks = 0;
      let toolCallsFound = 0;
      let hasEmittedContent = false;
      // Store raw parts from response to preserve thought_signature for multi-turn
      const rawModelParts: Part[] = [];
      let fullText = '';

      for await (const chunk of streamResult.stream) {
        // Process the response
        const response = chunk;

        // Check for function calls in the candidates
        if (response.candidates) {
          for (const candidate of response.candidates) {
            if (candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                // Store the raw part (may include thought_signature in raw form)
                // Cast to any to capture undocumented fields like thought_signature
                rawModelParts.push(part as Part);

                // Handle function calls
                if ('functionCall' in part && part.functionCall) {
                  // Function call found - will be emitted after stream
                }

                // Handle text content
                if ('text' in part && part.text) {
                  if (!hasEmittedContent && this.enableThinking) {
                    yield { type: 'thinking', content: '\nForming response...' };
                    hasEmittedContent = true;
                  }
                  textChunks++;
                  fullText += part.text;
                  yield {
                    type: 'text',
                    content: part.text,
                  };
                }
              }
            }
          }
        }
      }

      // Extract function calls from raw parts
      const functionCallParts = rawModelParts.filter(
        (p) => 'functionCall' in p && p.functionCall
      );

      // Emit function calls at the end
      for (const part of functionCallParts) {
        if (!('functionCall' in part) || !part.functionCall) continue;
        const fc = part.functionCall;
        toolCallsFound++;
        const toolCallId = `call_${Date.now()}_${toolCallsFound}`;

        agentLog.ai('google', 'TOOL CALL EXTRACTED', {
          name: fc.name,
          id: toolCallId,
          hasArgs: !!fc.args,
          // Log if we captured any extra fields (like thought_signature)
          rawPartKeys: Object.keys(part),
        });

        // Emit thinking hint for function call
        if (this.enableThinking) {
          yield {
            type: 'thinking',
            content: `\nConsidering ${this.formatToolNameForThinking(fc.name || '')}...`,
          };
        }

        // Include the raw part in the tool call for preservation
        // The harness will store this and replay it in buildContents
        yield {
          type: 'tool_call',
          content: '',
          name: fc.name || '',
          arguments: (fc.args as Record<string, unknown>) || {},
          toolCallId,
          // Store raw part for multi-turn - includes thought_signature if present
          rawPart: part as unknown as Record<string, unknown>,
        };
      }

      agentLog.ai('google', 'STREAM COMPLETE', {
        textChunks,
        toolCalls: toolCallsFound,
        textLength: fullText.length,
      });

      yield { type: 'done', content: '' };
    } catch (error) {
      agentLog.error('Google Gemini API', error);
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
      google_search: 'searching the web',
    };
    return toolLabels[name] || name.replace(/_/g, ' ');
  }
}
