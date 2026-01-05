import { Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  ConversationMessage,
  AIModelId,
  PromptStyleId,
  PromptStyle,
  ReasoningPhase as SharedReasoningPhase,
} from '@chess/shared';
import { ChessManager } from '../chess/manager.js';
import { ConversationManager } from './conversationManager.js';
import {
  createAIProvider,
  type AIProvider,
  type Message,
  type ReasoningPhase,
  AVAILABLE_MODELS,
  AnthropicProvider,
  OpenAIProvider,
  GoogleProvider,
} from './providers/index.js';
import { createTools, executeToolCall, type ToolContext } from './tools/index.js';
import { agentLog } from '../utils/logger.js';
import { conversationLogger } from '../utils/conversationLogger.js';

const MAX_TOOL_ITERATIONS = 20; // Natural pause point for teaching flow

type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Models that should use OpenAI provider
const OPENAI_MODELS: AIModelId[] = ['chatgpt-5.2'];

// Models that should use Google provider
const GOOGLE_MODELS: AIModelId[] = ['gemini-3-pro'];

// Available prompt styles
export const AVAILABLE_PROMPT_STYLES: PromptStyle[] = [
  {
    id: 'detailed',
    name: 'Detailed',
    description: 'Thorough explanations with teaching workflow',
  },
  {
    id: 'terse',
    name: 'Principles',
    description: 'Brief focus on themes and plans',
  },
];

export class AgentHarness {
  private gameManager: ChessManager;
  private conversationManager: ConversationManager;
  private socket: ClientSocket;
  private aiProvider: AIProvider;
  private anthropicProvider: AnthropicProvider;
  private openaiProvider: OpenAIProvider | null = null;
  private googleProvider: GoogleProvider | null = null;
  private currentModelId: AIModelId = 'claude-sonnet-4';
  private currentPromptStyleId: PromptStyleId = 'detailed';
  private isProcessing: boolean;
  // Track settings at harness level to sync across provider switches
  private thinkingEnabled: boolean = true;
  private webSearchEnabled: boolean = true;
  // Track pending multiple choice for cancellation support
  private pendingMultipleChoiceCancel: (() => void) | null = null;
  // Abort controller for interrupting conversations
  private abortController: AbortController | null = null;
  private currentConversationId: string | null = null;

  constructor(
    gameManager: ChessManager,
    conversationManager: ConversationManager,
    socket: ClientSocket
  ) {
    this.gameManager = gameManager;
    this.conversationManager = conversationManager;
    this.socket = socket;
    this.anthropicProvider = new AnthropicProvider();
    this.aiProvider = this.anthropicProvider;
    this.isProcessing = false;
  }

  private getOpenAIProvider(): OpenAIProvider {
    if (!this.openaiProvider) {
      this.openaiProvider = new OpenAIProvider();
    }
    return this.openaiProvider;
  }

  private getGoogleProvider(): GoogleProvider {
    if (!this.googleProvider) {
      this.googleProvider = new GoogleProvider();
    }
    return this.googleProvider;
  }

  getAvailableModels() {
    return AVAILABLE_MODELS;
  }

  getCurrentModel(): string {
    return this.aiProvider.model;
  }

  setModel(modelId: AIModelId): void {
    this.currentModelId = modelId;

    // Switch provider based on model type
    if (OPENAI_MODELS.includes(modelId)) {
      this.aiProvider = this.getOpenAIProvider();
      agentLog.ai('harness', 'SWITCHING TO OPENAI PROVIDER', { modelId });
    } else if (GOOGLE_MODELS.includes(modelId)) {
      this.aiProvider = this.getGoogleProvider();
      agentLog.ai('harness', 'SWITCHING TO GOOGLE PROVIDER', { modelId });
    } else {
      this.aiProvider = this.anthropicProvider;
      agentLog.ai('harness', 'USING ANTHROPIC PROVIDER', { modelId });
    }

    // Now set the model on the correct provider
    if (this.aiProvider.setModel) {
      this.aiProvider.setModel(modelId);
    }

    // Sync thinking/webSearch settings to the new provider
    if (this.aiProvider.setThinking) {
      this.aiProvider.setThinking(this.thinkingEnabled);
    }
    if (this.aiProvider.setWebSearch) {
      this.aiProvider.setWebSearch(this.webSearchEnabled);
    }

    this.socket.emit('model:changed', modelId);
    agentLog.ai(this.aiProvider.name, 'MODEL SWITCHED', {
      modelId,
      apiModel: this.aiProvider.model,
      thinkingEnabled: this.thinkingEnabled,
      webSearchEnabled: this.webSearchEnabled,
    });
  }

  setThinkingEnabled(enabled: boolean): void {
    this.thinkingEnabled = enabled;
    if (this.aiProvider.setThinking) {
      this.aiProvider.setThinking(enabled);
    }
  }

  setWebSearchEnabled(enabled: boolean): void {
    this.webSearchEnabled = enabled;
    if (this.aiProvider.setWebSearch) {
      this.aiProvider.setWebSearch(enabled);
    }
  }

  getAvailablePromptStyles(): PromptStyle[] {
    return AVAILABLE_PROMPT_STYLES;
  }

  getCurrentPromptStyle(): PromptStyleId {
    return this.currentPromptStyleId;
  }

  setPromptStyle(styleId: PromptStyleId): void {
    this.currentPromptStyleId = styleId;
    this.socket.emit('prompt:changed', styleId);
    agentLog.ai('harness', 'PROMPT STYLE CHANGED', { styleId });
  }

  getAgentSettings(): { thinking: boolean; webSearch: boolean; promptStyle: PromptStyleId } {
    const baseSettings = this.aiProvider.getSettings
      ? this.aiProvider.getSettings()
      : { thinking: false, webSearch: false };
    return { ...baseSettings, promptStyle: this.currentPromptStyleId };
  }

  /**
   * Cancel any pending multiple choice question.
   * Called when a new message arrives to interrupt the waiting state.
   */
  cancelPendingMultipleChoice(): void {
    if (this.pendingMultipleChoiceCancel) {
      agentLog.ai('harness', 'CANCELLING PENDING MULTIPLE CHOICE');
      this.pendingMultipleChoiceCancel();
      this.pendingMultipleChoiceCancel = null;
    }
  }

  /**
   * Register a cancel callback for a pending multiple choice.
   * Used by the tool to allow external cancellation.
   */
  registerMultipleChoiceCancel(cancel: () => void): void {
    this.pendingMultipleChoiceCancel = cancel;
  }

  /**
   * Clear the multiple choice cancel callback (called when MC completes normally)
   */
  clearMultipleChoiceCancel(): void {
    this.pendingMultipleChoiceCancel = null;
  }

  /**
   * Abort an in-flight conversation.
   * This signals the processing loop to stop and emits an interrupted event.
   */
  abortConversation(conversationId: string): void {
    if (!this.isProcessing || this.currentConversationId !== conversationId) {
      agentLog.conversation(conversationId, 'ABORT IGNORED - not processing this conversation');
      return;
    }

    agentLog.conversation(conversationId, 'ABORTING');

    // Cancel any pending multiple choice
    this.cancelPendingMultipleChoice();

    // Signal abort to the processing loop
    if (this.abortController) {
      this.abortController.abort();
    }

    // Emit interrupted event
    this.socket.emit('conversation:interrupted', conversationId);
  }

  async processMessage(conversationId: string, userMessage: string): Promise<void> {
    const processingStartTime = Date.now();

    agentLog.conversation(conversationId, 'MESSAGE RECEIVED', {
      message: userMessage.slice(0, 100) + (userMessage.length > 100 ? '...' : ''),
    });

    // If there's a pending multiple choice, cancel it and allow the new message
    if (this.isProcessing && this.pendingMultipleChoiceCancel) {
      agentLog.conversation(conversationId, 'INTERRUPTING PENDING MULTIPLE CHOICE');
      this.cancelPendingMultipleChoice();
      // Give a moment for the cancellation to propagate
      await new Promise((resolve) => setTimeout(resolve, 10));
      this.isProcessing = false;
    }

    if (this.isProcessing) {
      agentLog.conversation(conversationId, 'BLOCKED - Already processing');
      conversationLogger.error(conversationId, 'processMessage', 'Already processing a message');
      this.socket.emit('conversation:error', 'Already processing a message');
      return;
    }

    this.isProcessing = true;
    this.currentConversationId = conversationId;
    this.abortController = new AbortController();
    agentLog.conversation(conversationId, 'PROCESSING STARTED');

    try {
      // Get or create conversation - ALWAYS use the client-provided ID
      let conversation = this.conversationManager.getConversation(conversationId);
      const isNewConversation = !conversation;
      if (!conversation) {
        // Use the client's conversation ID to prevent ID mismatch
        conversation = this.conversationManager.createConversation(conversationId);
        agentLog.conversation(conversationId, 'NEW CONVERSATION CREATED');
      } else {
        agentLog.conversation(conversationId, 'EXISTING CONVERSATION', {
          messageCount: conversation.messages.length,
        });
      }

      // File logging: conversation start
      conversationLogger.conversationStart(
        conversationId,
        isNewConversation,
        conversation.messages.length,
        this.socket.id
      );
      conversationLogger.userMessage(conversationId, userMessage);

      // Add user message to server-side conversation history
      // Note: We don't emit back to client - they already added it optimistically
      this.conversationManager.addMessage(conversationId, {
        conversationId,
        role: 'user',
        content: userMessage,
      });

      // Prepare messages for AI (will be updated in the agentic loop)
      let aiMessages: Message[] = conversation.messages.map(
        (m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })
      );

      agentLog.conversation(conversationId, 'CONTEXT PREPARED', {
        messageCount: aiMessages.length,
        roles: aiMessages.map((m) => m.role),
      });

      // Create tools
      const tools = createTools();
      agentLog.conversation(
        conversationId,
        'TOOLS AVAILABLE',
        tools.map((t) => t.name)
      );

      // Emit thinking indicator (start)
      agentLog.thinking(conversationId, 'Emitting thinking indicator to client');
      agentLog.socket('conversation:thinking', 'emit', {
        conversationId,
        content: '',
        done: false,
      });
      conversationLogger.thinkingStart(conversationId);
      this.socket.emit('conversation:thinking', { conversationId, content: '', done: false });

      // Generate AI response with streaming - AGENTIC LOOP
      const messageId = uuidv4();
      let fullContent = '';
      let hasStartedStreaming = false;
      let chunkCount = 0;
      let toolCallCount = 0;
      const apiStartTime = Date.now();
      let thinkingEndLogged = false;
      let iteration = 0;

      agentLog.ai(this.aiProvider.name, 'STARTING AGENTIC LOOP', { messageId });

      // Agentic loop - keep going until AI produces final response without tool calls
      while (iteration < MAX_TOOL_ITERATIONS) {
        // Check if aborted
        if (this.abortController?.signal.aborted) {
          agentLog.conversation(conversationId, 'ABORTED - stopping loop');
          break;
        }

        iteration++;

        // Set reasoning phase: planning for first iteration, executing for subsequent
        const reasoningPhase: ReasoningPhase = iteration === 1 ? 'planning' : 'executing';
        if (this.aiProvider.setReasoningPhase) {
          this.aiProvider.setReasoningPhase(reasoningPhase);
        }

        // Get current budget info for UI
        const currentBudget = this.aiProvider.getCurrentBudget?.() ?? 0;

        agentLog.ai(this.aiProvider.name, `ITERATION ${iteration}`, {
          messageCount: aiMessages.length,
          reasoningPhase,
          thinkingBudget: currentBudget,
        });

        // Emit reasoning mode to client
        this.socket.emit('conversation:reasoningMode', {
          conversationId,
          phase: reasoningPhase,
          iteration,
          budgetTokens: currentBudget,
          maxIterations: MAX_TOOL_ITERATIONS,
        });

        // Get fresh game state for each iteration (tools may have modified it)
        const gameState = this.gameManager.getState();
        const systemPrompt = this.buildSystemPrompt(gameState);

        if (iteration === 1) {
          // File logging: game state (only first iteration)
          conversationLogger.gameState(
            conversationId,
            gameState.fen,
            gameState.turn,
            gameState.currentMoveIndex,
            gameState.history.length,
            gameState.pgn
          );

          // File logging: API request
          conversationLogger.apiRequest(
            conversationId,
            this.aiProvider.name,
            this.aiProvider.model,
            aiMessages.length,
            tools.length,
            systemPrompt
          );
        }

        const stream = this.aiProvider.chat(
          [{ role: 'system', content: systemPrompt }, ...aiMessages],
          tools
        );

        let iterationTextContent = '';
        let iterationThinkingContent = '';
        let iterationThinkingSignature = '';
        let pendingToolCalls: Array<{
          name: string;
          arguments: Record<string, unknown>;
          toolCallId: string;
          result: unknown;
          rawPart?: Record<string, unknown>; // For Gemini thought_signature preservation
        }> = [];

        for await (const chunk of stream) {
          if (chunk.type === 'thinking') {
            // Chain of thought content - capture for tool use continuation
            iterationThinkingContent += chunk.content;
            this.socket.emit('conversation:thinking', {
              conversationId,
              content: chunk.content,
              done: false,
            });
          } else if (chunk.type === 'thinking_signature') {
            // Thinking signature - must be preserved for multi-turn with tool use
            iterationThinkingSignature = chunk.content;
          } else if (chunk.type === 'text') {
            if (!hasStartedStreaming) {
              agentLog.stream(conversationId, 'FIRST TEXT CHUNK');
              hasStartedStreaming = true;

              // Log thinking end when streaming starts
              if (!thinkingEndLogged) {
                this.socket.emit('conversation:thinking', {
                  conversationId,
                  content: '',
                  done: true,
                });
                conversationLogger.thinkingEnd(conversationId, Date.now() - apiStartTime);
                thinkingEndLogged = true;
              }
            }
            chunkCount++;
            iterationTextContent += chunk.content;
            fullContent += chunk.content;

            // Log every 10th chunk to avoid spam
            if (chunkCount % 10 === 0) {
              agentLog.stream(conversationId, `CHUNK #${chunkCount}`, fullContent.slice(-100));
            }

            // File logging: stream chunks (sampled)
            conversationLogger.streamChunk(
              conversationId,
              chunkCount,
              chunk.content.length,
              fullContent.length
            );

            this.socket.emit('conversation:stream', {
              conversationId,
              messageId,
              content: chunk.content,
              done: false,
            });
          } else if (
            chunk.type === 'tool_call' &&
            chunk.name &&
            chunk.arguments &&
            chunk.toolCallId
          ) {
            // Log thinking end if we go straight to tool call
            if (!thinkingEndLogged) {
              this.socket.emit('conversation:thinking', {
                conversationId,
                content: '',
                done: true,
              });
              conversationLogger.thinkingEnd(conversationId, Date.now() - apiStartTime);
              thinkingEndLogged = true;
            }

            toolCallCount++;
            const toolStartTime = Date.now();

            agentLog.tool(conversationId, chunk.name, 'start');
            agentLog.tool(conversationId, chunk.name, 'args', chunk.arguments);

            // File logging: tool call start
            conversationLogger.toolCallStart(conversationId, chunk.name, chunk.arguments);

            // Emit tool call indicator with args
            agentLog.socket('conversation:toolCall', 'emit', {
              toolName: chunk.name,
              status: 'calling',
              args: chunk.arguments,
            });
            this.socket.emit('conversation:toolCall', {
              conversationId,
              toolName: chunk.name,
              status: 'calling',
              args: chunk.arguments,
            });

            // Execute tool call
            let result: unknown;
            try {
              // Create tool context for coordination (multiple choice cancellation)
              const toolContext: ToolContext = {
                registerMultipleChoiceCancel: (cancel) => this.registerMultipleChoiceCancel(cancel),
                clearMultipleChoiceCancel: () => this.clearMultipleChoiceCancel(),
              };

              result = await executeToolCall(
                chunk.name,
                chunk.arguments,
                this.gameManager,
                this.socket,
                toolContext
              );

              agentLog.tool(conversationId, chunk.name, 'result', result);

              // File logging: tool call result
              conversationLogger.toolCallResult(conversationId, chunk.name, result, toolStartTime);
            } catch (toolError) {
              agentLog.tool(conversationId, chunk.name, 'error', toolError);
              result = {
                error: toolError instanceof Error ? toolError.message : String(toolError),
              };

              // File logging: tool call error
              conversationLogger.toolCallError(
                conversationId,
                chunk.name,
                toolError instanceof Error ? toolError.message : String(toolError),
                toolStartTime
              );
            }

            // Emit tool call complete with result
            agentLog.socket('conversation:toolCall', 'emit', {
              toolName: chunk.name,
              status: 'complete',
              result,
            });
            this.socket.emit('conversation:toolCall', {
              conversationId,
              toolName: chunk.name,
              status: 'complete',
              result,
            });

            // Store tool call for message history
            pendingToolCalls.push({
              name: chunk.name,
              arguments: chunk.arguments,
              toolCallId: chunk.toolCallId,
              result,
              rawPart: chunk.rawPart, // Preserve Gemini raw part with thought_signature
            });
          } else if (chunk.type === 'done') {
            agentLog.stream(conversationId, 'STREAM DONE SIGNAL');
          }
        }

        // If there were tool calls, add them to message history and continue
        if (pendingToolCalls.length > 0) {
          // Check if any tool was cancelled (by new user message) - abort the loop
          const wasCancelled = pendingToolCalls.some(
            (tc) =>
              tc.result && typeof tc.result === 'object' && (tc.result as any).cancelled === true
          );

          if (wasCancelled) {
            agentLog.ai(this.aiProvider.name, 'TOOL CANCELLED - ABORTING LOOP', {
              tool: pendingToolCalls.find((tc) => (tc.result as any)?.cancelled)?.name,
            });
            // Don't continue the loop - a new message is being processed
            break;
          }

          // Check if any tool requested to stop the loop (e.g., user dismissed multiple choice)
          const shouldStopLoop = pendingToolCalls.some(
            (tc) =>
              tc.result && typeof tc.result === 'object' && (tc.result as any).stopLoop === true
          );

          if (shouldStopLoop) {
            agentLog.ai(this.aiProvider.name, 'TOOL REQUESTED STOP - ENDING LOOP', {
              tool: pendingToolCalls.find((tc) => (tc.result as any)?.stopLoop)?.name,
            });
            // User dismissed the prompt - just stop, don't continue agent processing
            break;
          }

          // Check if any tool result indicates user interaction (e.g., multiple choice answer)
          // If so, reset iteration to treat next iteration as a new planning phase
          const userInteracted = pendingToolCalls.some(
            (tc) =>
              tc.result &&
              typeof tc.result === 'object' &&
              (tc.result as any).userInteracted === true
          );

          if (userInteracted) {
            // Reset iteration to 0 so next iteration (1) enters planning mode
            // This gives fresh token budget and resets tool call allowance
            iteration = 0;
            agentLog.ai(this.aiProvider.name, 'USER INTERACTION - RESETTING TO PLANNING MODE', {
              trigger: pendingToolCalls.find((tc) => (tc.result as any)?.userInteracted)?.name,
            });
          }

          agentLog.ai(this.aiProvider.name, 'TOOL CALLS COMPLETED', {
            count: pendingToolCalls.length,
            tools: pendingToolCalls.map((tc) => tc.name),
            hasThinking: iterationThinkingContent.length > 0,
            userInteracted,
          });

          // Add assistant message (with thinking block for Anthropic extended thinking)
          // Per Anthropic docs: thinking blocks must be preserved for tool use continuation
          aiMessages.push({
            role: 'assistant',
            content: iterationTextContent,
            thinking: iterationThinkingContent || undefined,
            thinkingSignature: iterationThinkingSignature || undefined,
          });

          // Add tool results as individual tool messages
          for (const tc of pendingToolCalls) {
            aiMessages.push({
              role: 'tool',
              content: JSON.stringify(tc.result),
              toolCallId: tc.toolCallId,
              name: tc.name,
              toolArguments: tc.arguments, // Store original arguments for Anthropic message reconstruction
              rawPart: tc.rawPart, // Store raw Gemini part with thought_signature for multi-turn
            });
          }

          // Continue to next iteration
          continue;
        }

        // No tool calls - we're done
        agentLog.ai(this.aiProvider.name, 'AGENTIC LOOP COMPLETE', { iterations: iteration });
        break;
      }

      if (iteration >= MAX_TOOL_ITERATIONS) {
        agentLog.ai(this.aiProvider.name, 'TEACHING PAUSE', { iterations: iteration });
        this.socket.emit('conversation:stream', {
          conversationId,
          messageId,
          content:
            '\n\n*Let me pause here. Feel free to ask follow-up questions to continue exploring!*',
          done: false,
        });
        fullContent +=
          '\n\n*Let me pause here. Feel free to ask follow-up questions to continue exploring!*';
      }

      const apiDuration = Date.now() - apiStartTime;
      agentLog.stream(
        conversationId,
        'STREAM COMPLETE',
        `${chunkCount} chunks, ${toolCallCount} tool calls, ${iteration} iterations`
      );

      // File logging: API response summary
      conversationLogger.apiResponse(
        conversationId,
        this.aiProvider.name,
        chunkCount,
        toolCallCount,
        apiDuration
      );

      // Signal end of stream
      agentLog.socket('conversation:stream', 'emit', { done: true });
      this.socket.emit('conversation:stream', {
        conversationId,
        messageId,
        content: '',
        done: true,
      });

      // Save assistant message
      if (fullContent) {
        this.conversationManager.addMessage(conversationId, {
          conversationId,
          role: 'assistant',
          content: fullContent,
        });
        agentLog.conversation(conversationId, 'ASSISTANT MESSAGE SAVED', {
          length: fullContent.length,
          preview: fullContent.slice(0, 100) + (fullContent.length > 100 ? '...' : ''),
        });

        // File logging: assistant message
        conversationLogger.assistantMessage(conversationId, fullContent, messageId);
      }

      agentLog.socket('conversation:end', 'emit', { conversationId });
      this.socket.emit('conversation:end', conversationId);

      // File logging: conversation end
      const totalMessages =
        this.conversationManager.getConversation(conversationId)?.messages.length || 0;
      conversationLogger.conversationEnd(conversationId, totalMessages, toolCallCount);

      agentLog.conversation(conversationId, 'PROCESSING COMPLETE ✓');
    } catch (error) {
      agentLog.error(`processMessage(${conversationId})`, error);

      // File logging: error
      conversationLogger.error(conversationId, 'processMessage', error);

      this.socket.emit(
        'conversation:error',
        error instanceof Error ? error.message : 'Failed to process message'
      );
    } finally {
      this.isProcessing = false;
      this.currentConversationId = null;
      this.abortController = null;
    }
  }

  private buildSystemPrompt(gameState: {
    fen: string;
    pgn: string;
    turn: string;
    history: Array<{ san?: string }>;
    currentMoveIndex: number;
    isCheck?: boolean;
    isCheckmate?: boolean;
    isStalemate?: boolean;
    isDraw?: boolean;
    isGameOver?: boolean;
  }): string {
    if (this.currentPromptStyleId === 'terse') {
      return this.buildTersePrompt(gameState);
    }
    return this.buildDetailedPrompt(gameState);
  }

  private buildTersePrompt(gameState: {
    fen: string;
    pgn: string;
    turn: string;
    history: Array<{ san?: string }>;
    currentMoveIndex: number;
    isCheck?: boolean;
    isCheckmate?: boolean;
    isStalemate?: boolean;
    isDraw?: boolean;
    isGameOver?: boolean;
  }): string {
    const moveList = gameState.history
      .map((m, i) => {
        const moveNum = Math.floor(i / 2) + 1;
        const isWhite = i % 2 === 0;
        return isWhite ? `${moveNum}. ${m.san}` : m.san;
      })
      .join(' ');

    let gameStatus = '';
    if (gameState.isCheckmate) {
      gameStatus = ` CHECKMATE - ${gameState.turn === 'w' ? 'Black' : 'White'} wins`;
    } else if (gameState.isCheck) {
      gameStatus = ` CHECK`;
    }

    return `You are a chess teacher. Focus on opening principles, themes, and plans. Be brief.

Position: ${gameState.fen}
Turn: ${gameState.turn === 'w' ? 'White' : 'Black'}${gameStatus}
${moveList ? `Moves: ${moveList}` : 'Starting position'}

APPROACH:
- Name the opening and its key ideas in 1-2 sentences
- State the strategic themes (center control, piece activity, king safety, pawn structure)
- Identify each side's plans
- When demonstrating, show moves then briefly explain why

TOOLS:
- reset_board, make_moves, undo_moves: demonstrate lines
- draw_arrows, highlight_squares: show key ideas (max 3-4 arrows)
- explore_continuations, get_position_stats: database lines (masters/lichess)
- analyze_line: validate sequences before showing
- analyze_position: Stockfish engine evaluation and best moves
- ask_multiple_choice: stop frequently to let user choose direction

Keep explanations short. Prefer showing over telling. One concept at a time.
After each concept, use ask_multiple_choice to let user pick what to explore next.`;
  }

  private buildDetailedPrompt(gameState: {
    fen: string;
    pgn: string;
    turn: string;
    history: Array<{ san?: string }>;
    currentMoveIndex: number;
    isCheck?: boolean;
    isCheckmate?: boolean;
    isStalemate?: boolean;
    isDraw?: boolean;
    isGameOver?: boolean;
  }): string {
    const moveList = gameState.history
      .map((m, i) => {
        const moveNum = Math.floor(i / 2) + 1;
        const isWhite = i % 2 === 0;
        return isWhite ? `${moveNum}. ${m.san}` : m.san;
      })
      .join(' ');

    // Build game status string
    let gameStatus = '';
    if (gameState.isCheckmate) {
      gameStatus = `\n- STATUS: CHECKMATE - ${gameState.turn === 'w' ? 'Black' : 'White'} wins!`;
    } else if (gameState.isStalemate) {
      gameStatus = '\n- STATUS: STALEMATE - Draw';
    } else if (gameState.isDraw) {
      gameStatus = '\n- STATUS: DRAW';
    } else if (gameState.isCheck) {
      gameStatus = `\n- STATUS: ${gameState.turn === 'w' ? 'White' : 'Black'} is in CHECK`;
    }

    return `You are an expert chess coach specializing in opening theory and strategic themes. You help players study and understand chess openings. 

Current Position:
- FEN: ${gameState.fen}
- Turn: ${gameState.turn === 'w' ? 'White' : 'Black'} to move
- Move ${gameState.currentMoveIndex} of ${gameState.history.length}
${moveList ? `- Moves played: ${moveList}` : '- Starting position'}${gameStatus}

### PHASE 1: RESEARCH (Before anything else)

1. **WEB SEARCH** - Research how to teach this opening/trap/concept to a beginner.

2. **UNDERSTAND THE "WHY"** - Before touching the board, answer for yourself:
   - What are the general themes of this opening/trap/concept?
   - What are the main variations and how do they differ?
   - What are the common mistakes players make?
   - What are the attacking plans and how do they transition as the game progresses?

3. **RESEARCH COMMON LINES** - Use the database to find the most common lines for this opening.
- **explore_continuations**: Compare candidate moves to see which paths exist (masters/lichess database)
- **analyze_line**: Validate that the sequences you plan to show are correct
- **get_position_stats**: Check database frequencies to understand practical play
- **analyze_position**: Get Stockfish engine evaluation, best moves, and principal variation

### PHASE 2: CREATE A TEACHING PLAN AND SEND IT TO THE USER

1. **The Core Concept** (1-2 sentences) - What is the essential idea the student should understand?
2. **Key Themes** (2-3 points) - What strategic/tactical principles does this illustrate?
3. **Demo Sequence** - What specific lines will you show, and in what order?
4. **Annotate Your Demo** - Use draw_arrows and highlight_squares to illustrate key ideas as you explain them
5. **Plan Your Next Steps** - Use ask_multiple_choice to let the user pick what they want to explore next.

### PHASE 4: EXECUTE THE TEACHING PLAN

- Follow your plan systematically
- Explain the WHY before showing the HOW
- Use pauses between major concepts
- Limit visual clutter (3-4 arrows max)

The goal is UNDERSTANDING, not just showing moves. A student who understands WHY the Italian Game leads to certain pawn structures is better than one who memorized 15 moves.

=== TOOL STRATEGY ===

**DEFAULT FOCUS: TOP 5 LICHESS LINES**
By default, focus your teaching on the **top 5 most common moves from the Lichess database** at each position. These represent the lines students will actually encounter in practical play. Only explore rarer variations if:
- The user explicitly asks for sidelines, obscure variations, or theoretical novelties
- You're showing a trap that punishes a specific (common) mistake
- The top lines don't adequately illustrate the concept being taught

Use both Masters and Lichess databases strategically:
- **Masters database**: Shows theoretically correct play (strong players avoid traps)
- **Lichess database**: Shows what club players actually do - **prioritize this for teaching**
- A move rare in Masters but common on Lichess often indicates a trap that punishes amateur mistakes
- When exploring continuations, pay attention to game counts - higher counts = more practical relevance

If the databases don't have information about a line, start to use the engine to find good variations.

After looking at moves, decide how you're going to teach the concepts with draw_arrows and highlight_squares and description.

Challenge the user with questions and always include the ability to proceed with the current variation to understand how we can complete our current plan.

=== TEACHING STYLE ===

**CRITICAL: SHORT SEQUENCES AND USER INTERACTION IS REQUIRED**
Start with basic explanations and then show the moves. Ask the user what they want to see next. Give them good choices for what to explore next based on popularity as well as research on what theoretical ideas are important.

**CONCEPT-FIRST TEACHING**: Always explain the "why" before the "how":
- State the strategic purpose BEFORE showing moves
- "This opening aims to control the center with pawns while developing knights toward..." THEN demo
- "The trap works because Black's king becomes exposed after..." THEN show the line

**CHUNKED EXPLANATIONS**: Break complex topics into digestible pieces:
- One concept at a time (e.g., first show the setup, then the threat, then the defense)
- 1 short paragraph per chunk, THEN call **ask_multiple_choice** to let the user pick what's next
- After demonstrating a key position, ALWAYS offer choices for what to explore next

**VISUAL CLARITY**:
- Clear annotations before drawing new ones for a different concept
- Use arrows to show 1 - 3 idea (e.g., a piece's attacking options, or a single threat)

**DEMONSTRATIONS**:
- Use draw_arrows and highlight_squares to illustrate key ideas as you explain them
- Show BOTH the trap succeeding AND the correct defense
- Use analyze_position to verify tactical consequences when needed

**PACING**: You can use up to ${MAX_TOOL_ITERATIONS} tool calls per response. Structure explanations so each response delivers a complete thought or demonstration. End EVERY response with ask_multiple_choice unless the user asked a yes/no question.

Be conversational and encouraging. Help the player develop chess intuition.`;
  }
}
