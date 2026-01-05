/**
 * Conversation File Logger
 * 
 * Records all agent interactions to JSON log files for debugging and analysis.
 * Each conversation gets its own log file with complete interaction history.
 * 
 * Enable with: AGENT_LOG_DIR=./logs npm run dev:server
 * 
 * Log files are stored as: {AGENT_LOG_DIR}/{conversationId}.json
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = process.env.AGENT_LOG_DIR || '';
const ENABLE_FILE_LOGGING = !!LOG_DIR;

// Types for log entries
export interface BaseLogEntry {
  timestamp: string;
  conversationId: string;
  type: string;
  sequence: number;
}

export interface MessageLogEntry extends BaseLogEntry {
  type: 'user_message' | 'assistant_message' | 'system_message';
  content: string;
  messageId?: string;
}

export interface ThinkingLogEntry extends BaseLogEntry {
  type: 'thinking_start' | 'thinking_end';
  durationMs?: number;
}

export interface ToolCallLogEntry extends BaseLogEntry {
  type: 'tool_call';
  toolName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface ApiRequestLogEntry extends BaseLogEntry {
  type: 'api_request';
  provider: string;
  model: string;
  messageCount: number;
  toolCount: number;
  systemPromptLength: number;
  systemPromptPreview: string;
}

export interface ApiResponseLogEntry extends BaseLogEntry {
  type: 'api_response';
  provider: string;
  textChunks: number;
  toolCalls: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  stopReason?: string;
}

export interface StreamChunkLogEntry extends BaseLogEntry {
  type: 'stream_chunk';
  chunkIndex: number;
  contentLength: number;
  totalContentLength: number;
}

export interface GameStateLogEntry extends BaseLogEntry {
  type: 'game_state';
  fen: string;
  turn: string;
  moveIndex: number;
  totalMoves: number;
  pgn?: string;
}

export interface ErrorLogEntry extends BaseLogEntry {
  type: 'error';
  context: string;
  message: string;
  stack?: string;
}

export interface ConversationStartLogEntry extends BaseLogEntry {
  type: 'conversation_start';
  isNew: boolean;
  existingMessageCount: number;
}

export interface ConversationEndLogEntry extends BaseLogEntry {
  type: 'conversation_end';
  totalMessages: number;
  totalToolCalls: number;
  totalDurationMs: number;
}

export type LogEntry = 
  | MessageLogEntry 
  | ThinkingLogEntry 
  | ToolCallLogEntry 
  | ApiRequestLogEntry 
  | ApiResponseLogEntry 
  | StreamChunkLogEntry 
  | GameStateLogEntry 
  | ErrorLogEntry
  | ConversationStartLogEntry
  | ConversationEndLogEntry;

// In-memory conversation logs
const conversationLogs = new Map<string, {
  entries: LogEntry[];
  sequence: number;
  startTime: number;
  metadata: {
    createdAt: string;
    lastUpdatedAt: string;
    socketId?: string;
  };
}>();

// Pending tool calls for duration tracking
const pendingToolCalls = new Map<string, { startTime: number; toolName: string }>();

// Ensure log directory exists
function ensureLogDir(): void {
  if (!ENABLE_FILE_LOGGING) return;
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    console.log(`[ConversationLogger] Created log directory: ${LOG_DIR}`);
  }
}

// Get or create conversation log
function getConversationLog(conversationId: string) {
  if (!conversationLogs.has(conversationId)) {
    conversationLogs.set(conversationId, {
      entries: [],
      sequence: 0,
      startTime: Date.now(),
      metadata: {
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      },
    });
  }
  return conversationLogs.get(conversationId)!;
}

// Add entry to conversation log
// Using 'any' type here because TypeScript's union type narrowing doesn't work well
// with Omit on discriminated unions. The public API methods ensure type safety.
function addEntry(conversationId: string, entry: Record<string, unknown>): void {
  if (!ENABLE_FILE_LOGGING) return;
  
  const log = getConversationLog(conversationId);
  const fullEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    conversationId,
    sequence: log.sequence++,
  } as LogEntry;
  
  log.entries.push(fullEntry);
  log.metadata.lastUpdatedAt = new Date().toISOString();
  
  // Write to file immediately for real-time debugging
  writeLogFile(conversationId);
}

// Write log to file
function writeLogFile(conversationId: string): void {
  if (!ENABLE_FILE_LOGGING) return;
  
  ensureLogDir();
  
  const log = conversationLogs.get(conversationId);
  if (!log) return;
  
  const filename = path.join(LOG_DIR, `${conversationId}.json`);
  const content = JSON.stringify({
    conversationId,
    metadata: log.metadata,
    entries: log.entries,
  }, null, 2);
  
  try {
    fs.writeFileSync(filename, content);
  } catch (error) {
    console.error(`[ConversationLogger] Failed to write log file: ${filename}`, error);
  }
}

/**
 * Conversation Logger API
 */
export const conversationLogger = {
  /**
   * Check if file logging is enabled
   */
  isEnabled(): boolean {
    return ENABLE_FILE_LOGGING;
  },

  /**
   * Log conversation start
   */
  conversationStart(conversationId: string, isNew: boolean, existingMessageCount: number, socketId?: string): void {
    const log = getConversationLog(conversationId);
    log.metadata.socketId = socketId;
    
    addEntry(conversationId, {
      type: 'conversation_start',
      isNew,
      existingMessageCount,
    });
  },

  /**
   * Log user message
   */
  userMessage(conversationId: string, content: string): void {
    addEntry(conversationId, {
      type: 'user_message',
      content,
    });
  },

  /**
   * Log assistant message (final, after streaming)
   */
  assistantMessage(conversationId: string, content: string, messageId?: string): void {
    addEntry(conversationId, {
      type: 'assistant_message',
      content,
      messageId,
    });
  },

  /**
   * Log system message
   */
  systemMessage(conversationId: string, content: string): void {
    addEntry(conversationId, {
      type: 'system_message',
      content,
    });
  },

  /**
   * Log thinking start
   */
  thinkingStart(conversationId: string): void {
    addEntry(conversationId, {
      type: 'thinking_start',
    });
  },

  /**
   * Log thinking end
   */
  thinkingEnd(conversationId: string, durationMs: number): void {
    addEntry(conversationId, {
      type: 'thinking_end',
      durationMs,
    });
  },

  /**
   * Log tool call start (returns a key for tracking)
   */
  toolCallStart(conversationId: string, toolName: string, args: Record<string, unknown>): string {
    const key = `${conversationId}:${toolName}:${Date.now()}`;
    pendingToolCalls.set(key, { startTime: Date.now(), toolName });
    
    addEntry(conversationId, {
      type: 'tool_call',
      toolName,
      arguments: args,
      durationMs: 0, // Will be updated on completion
    });
    
    return key;
  },

  /**
   * Log tool call result
   */
  toolCallResult(conversationId: string, toolName: string, result: unknown, startTime: number): void {
    const durationMs = Date.now() - startTime;
    
    // Find and update the most recent tool_call entry for this tool
    const log = conversationLogs.get(conversationId);
    if (log) {
      for (let i = log.entries.length - 1; i >= 0; i--) {
        const entry = log.entries[i];
        if (entry.type === 'tool_call' && (entry as ToolCallLogEntry).toolName === toolName && !(entry as ToolCallLogEntry).result) {
          (entry as ToolCallLogEntry).result = result;
          (entry as ToolCallLogEntry).durationMs = durationMs;
          writeLogFile(conversationId);
          break;
        }
      }
    }
  },

  /**
   * Log tool call error
   */
  toolCallError(conversationId: string, toolName: string, error: string, startTime: number): void {
    const durationMs = Date.now() - startTime;
    
    const log = conversationLogs.get(conversationId);
    if (log) {
      for (let i = log.entries.length - 1; i >= 0; i--) {
        const entry = log.entries[i];
        if (entry.type === 'tool_call' && (entry as ToolCallLogEntry).toolName === toolName && !(entry as ToolCallLogEntry).result) {
          (entry as ToolCallLogEntry).error = error;
          (entry as ToolCallLogEntry).durationMs = durationMs;
          writeLogFile(conversationId);
          break;
        }
      }
    }
  },

  /**
   * Log API request to AI provider
   */
  apiRequest(
    conversationId: string, 
    provider: string, 
    model: string, 
    messageCount: number, 
    toolCount: number,
    systemPrompt: string
  ): void {
    addEntry(conversationId, {
      type: 'api_request',
      provider,
      model,
      messageCount,
      toolCount,
      systemPromptLength: systemPrompt.length,
      systemPromptPreview: systemPrompt.slice(0, 500) + (systemPrompt.length > 500 ? '...' : ''),
    });
  },

  /**
   * Log API response summary
   */
  apiResponse(
    conversationId: string,
    provider: string,
    textChunks: number,
    toolCalls: number,
    durationMs: number,
    stopReason?: string,
    usage?: { inputTokens?: number; outputTokens?: number }
  ): void {
    addEntry(conversationId, {
      type: 'api_response',
      provider,
      textChunks,
      toolCalls,
      durationMs,
      stopReason,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage ? (usage.inputTokens || 0) + (usage.outputTokens || 0) : undefined,
    });
  },

  /**
   * Log stream chunk (sampled, not every chunk)
   */
  streamChunk(conversationId: string, chunkIndex: number, contentLength: number, totalContentLength: number): void {
    // Only log every 10th chunk to avoid spam
    if (chunkIndex % 10 === 0 || chunkIndex === 1) {
      addEntry(conversationId, {
        type: 'stream_chunk',
        chunkIndex,
        contentLength,
        totalContentLength,
      });
    }
  },

  /**
   * Log game state
   */
  gameState(conversationId: string, fen: string, turn: string, moveIndex: number, totalMoves: number, pgn?: string): void {
    addEntry(conversationId, {
      type: 'game_state',
      fen,
      turn,
      moveIndex,
      totalMoves,
      pgn,
    });
  },

  /**
   * Log error
   */
  error(conversationId: string, context: string, error: unknown): void {
    addEntry(conversationId, {
      type: 'error',
      context,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  },

  /**
   * Log conversation end
   */
  conversationEnd(conversationId: string, totalMessages: number, totalToolCalls: number): void {
    const log = conversationLogs.get(conversationId);
    const totalDurationMs = log ? Date.now() - log.startTime : 0;
    
    addEntry(conversationId, {
      type: 'conversation_end',
      totalMessages,
      totalToolCalls,
      totalDurationMs,
    });
  },

  /**
   * Get log file path for a conversation
   */
  getLogPath(conversationId: string): string | null {
    if (!ENABLE_FILE_LOGGING) return null;
    return path.join(LOG_DIR, `${conversationId}.json`);
  },

  /**
   * Get all log entries for a conversation (in-memory)
   */
  getEntries(conversationId: string): LogEntry[] {
    return conversationLogs.get(conversationId)?.entries || [];
  },

  /**
   * Export conversation log to a specific file
   */
  exportLog(conversationId: string, filepath: string): boolean {
    const log = conversationLogs.get(conversationId);
    if (!log) return false;
    
    try {
      const content = JSON.stringify({
        conversationId,
        metadata: log.metadata,
        exportedAt: new Date().toISOString(),
        entries: log.entries,
      }, null, 2);
      fs.writeFileSync(filepath, content);
      return true;
    } catch (error) {
      console.error(`[ConversationLogger] Failed to export log: ${filepath}`, error);
      return false;
    }
  },

  /**
   * Clear conversation from memory (file remains)
   */
  clearMemory(conversationId: string): void {
    conversationLogs.delete(conversationId);
  },
};

// Log on startup
if (ENABLE_FILE_LOGGING) {
  console.log(`[ConversationLogger] File logging enabled. Logs will be saved to: ${LOG_DIR}`);
  ensureLogDir();
}

export default conversationLogger;

