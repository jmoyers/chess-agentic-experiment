/**
 * Simple debug logger for agent operations
 * 
 * Console logging is ALWAYS enabled by default.
 * Set DEBUG=none to disable console logging.
 * Set AGENT_LOG_DIR=./logs to also write to files.
 */

const DEBUG = process.env.DEBUG || '';
const ENABLE_AGENT_DEBUG = DEBUG !== 'none'; // Always on unless explicitly disabled

// ANSI color codes for terminal
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
};

function timestamp(): string {
  return new Date().toISOString().split('T')[1].slice(0, 12);
}

function formatObject(obj: unknown): string {
  if (typeof obj === 'string') return obj;
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export const agentLog = {
  /**
   * Log conversation events
   */
  conversation: (conversationId: string, event: string, data?: unknown) => {
    if (!ENABLE_AGENT_DEBUG) return;
    const id = conversationId.slice(0, 8);
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.cyan}[CONV:${id}]${colors.reset} ${event}`,
      data !== undefined ? `\n${colors.dim}${formatObject(data)}${colors.reset}` : ''
    );
  },

  /**
   * Log thinking/processing state
   */
  thinking: (conversationId: string, message: string) => {
    if (!ENABLE_AGENT_DEBUG) return;
    const id = conversationId.slice(0, 8);
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.yellow}[THINK:${id}]${colors.reset} ${message}`
    );
  },

  /**
   * Log streaming events
   */
  stream: (conversationId: string, event: string, preview?: string) => {
    if (!ENABLE_AGENT_DEBUG) return;
    const id = conversationId.slice(0, 8);
    const previewText = preview ? ` "${preview.slice(0, 50)}${preview.length > 50 ? '...' : ''}"` : '';
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.blue}[STREAM:${id}]${colors.reset} ${event}${previewText}`
    );
  },

  /**
   * Log tool calls
   */
  tool: (conversationId: string, toolName: string, status: 'start' | 'args' | 'result' | 'error', data?: unknown) => {
    if (!ENABLE_AGENT_DEBUG) return;
    const id = conversationId.slice(0, 8);
    const statusColors: Record<string, string> = {
      start: colors.magenta,
      args: colors.dim,
      result: colors.green,
      error: colors.red,
    };
    const statusLabels: Record<string, string> = {
      start: '→ CALLING',
      args: '  ARGS',
      result: '← RESULT',
      error: '✗ ERROR',
    };
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${statusColors[status]}[TOOL:${id}]${colors.reset} ${statusLabels[status]} ${toolName}`,
      data !== undefined ? `\n${colors.dim}${formatObject(data)}${colors.reset}` : ''
    );
  },

  /**
   * Log socket events
   */
  socket: (event: string, direction: 'emit' | 'receive', data?: unknown) => {
    if (!ENABLE_AGENT_DEBUG) return;
    const arrow = direction === 'emit' ? '→' : '←';
    const color = direction === 'emit' ? colors.green : colors.cyan;
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${color}[SOCKET]${colors.reset} ${arrow} ${event}`,
      data !== undefined ? `\n${colors.dim}${formatObject(data)}${colors.reset}` : ''
    );
  },

  /**
   * Log errors
   */
  error: (context: string, error: unknown) => {
    // Always log errors
    console.error(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.red}[ERROR]${colors.reset} ${context}:`,
      error instanceof Error ? error.message : error
    );
    if (error instanceof Error && error.stack && ENABLE_AGENT_DEBUG) {
      console.error(`${colors.dim}${error.stack}${colors.reset}`);
    }
  },

  /**
   * Log AI provider events
   */
  ai: (provider: string, event: string, data?: unknown) => {
    if (!ENABLE_AGENT_DEBUG) return;
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.white}[AI:${provider}]${colors.reset} ${event}`,
      data !== undefined ? `\n${colors.dim}${formatObject(data)}${colors.reset}` : ''
    );
  },

  /**
   * Log game state changes
   */
  game: (event: string, data?: unknown) => {
    if (!ENABLE_AGENT_DEBUG) return;
    console.log(
      `${colors.dim}${timestamp()}${colors.reset} ${colors.yellow}[GAME]${colors.reset} ${event}`,
      data !== undefined ? `\n${colors.dim}${formatObject(data)}${colors.reset}` : ''
    );
  },
};

// Log on startup
if (ENABLE_AGENT_DEBUG) {
  console.log(`${colors.green}[AgentLog]${colors.reset} Console logging enabled (set DEBUG=none to disable)`);
}

export default agentLog;

