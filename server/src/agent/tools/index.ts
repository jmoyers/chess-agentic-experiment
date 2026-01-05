import { Socket } from 'socket.io';
import type {
  Tool,
  ServerToClientEvents,
  ClientToServerEvents,
  BoardArrow,
  SquareHighlight,
  LichessDatabase,
} from '@chess/shared';
import { ChessManager } from '../../chess/manager.js';
import { OpeningDatabase } from '../../database/openings.js';
import { getExplorer } from '../../database/lichess/index.js';
import { getStockfishService } from '../../engine/stockfish.js';

type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function createTools(): Tool[] {
  return [
    // =============================================================================
    // PURE INFORMATION TOOLS (never change the board)
    // =============================================================================
    {
      name: 'get_position_stats',
      description:
        'Get opening database statistics for the current board position. Shows win rates and most popular moves played. Does NOT change the board.',
      parameters: {
        type: 'object',
        properties: {
          database: {
            type: 'string',
            description:
              'Database to query: "masters" (OTB titled player games since 1952, default) or "lichess" (online games, can filter by rating/speed)',
            enum: ['masters', 'lichess'],
          },
          limit: {
            type: 'number',
            description: 'Maximum number of top moves to return (default: 5)',
          },
        },
        required: [],
      },
    },
    {
      name: 'explore_continuations',
      description:
        'Explore what happens after different candidate moves WITHOUT changing the board. Returns database statistics for each continuation including game counts, win rates, and top responses. Perfect for comparing options, finding traps, and understanding which moves lead to favorable positions. Use this to ask "what if they play X vs Y vs Z?"',
      parameters: {
        type: 'object',
        properties: {
          moves: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of candidate moves to explore (e.g., ["e4", "d4", "Nf3"]). Each move is analyzed from the current position.',
          },
          database: {
            type: 'string',
            description:
              'Database to query: "masters" or "lichess" (default: "lichess" - better for finding traps that work at club level)',
            enum: ['masters', 'lichess'],
          },
        },
        required: ['moves'],
      },
    },
    {
      name: 'analyze_line',
      description:
        'Analyze a complete move sequence showing database statistics at EACH position along the line. Does NOT change the board. Great for understanding where lines become rare (traps often hide there), where win rates shift, and how theory develops. Returns stats after each move in the sequence including game counts, win rates, and top continuations.',
      parameters: {
        type: 'object',
        properties: {
          moves: {
            type: 'array',
            items: { type: 'string' },
            description:
              'The line to analyze as an array of moves (e.g., ["d4", "d5", "Nc3", "Nf6", "Bf4"])',
          },
          database: {
            type: 'string',
            description: 'Database to query: "masters" or "lichess" (default: "lichess")',
            enum: ['masters', 'lichess'],
          },
        },
        required: ['moves'],
      },
    },
    {
      name: 'get_current_position',
      description:
        'Get the current chess position including FEN, move history, whose turn it is, and game status.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },

    // =============================================================================
    // BOARD PRIMITIVE TOOLS (manipulate the board like a player/coach)
    // =============================================================================
    {
      name: 'reset_board',
      description:
        'Reset the board to the starting position. Use this before demonstrating a new opening or starting fresh.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'make_move',
      description:
        'Make a single move on the chess board. Use SAN notation (e.g., "e4", "Nf3", "O-O") or UCI notation (e.g., "e2e4"). Use this for individual moves during explanation.',
      parameters: {
        type: 'object',
        properties: {
          move: {
            type: 'string',
            description:
              'The move in SAN format (e.g., "e4", "Nf3", "Bxc6") or UCI format (e.g., "e2e4")',
          },
        },
        required: ['move'],
      },
    },
    {
      name: 'make_moves',
      description:
        'Make a sequence of moves on the board. Perfect for demonstrating opening lines, tactical sequences, or showing a variation. Can animate moves with delays so the user can follow along, or execute instantly.',
      parameters: {
        type: 'object',
        properties: {
          moves: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of moves in SAN format (e.g., ["e4", "e5", "Nf3", "Nc6"])',
          },
          animate: {
            type: 'boolean',
            description:
              'Whether to animate moves with delays (default: true). Set false for instant execution.',
          },
          delayMs: {
            type: 'number',
            description: 'Delay between animated moves in ms (default: 1000, range: 500-2500)',
          },
          description: {
            type: 'string',
            description:
              'Optional description to show during animation (e.g., "Italian Game main line")',
          },
        },
        required: ['moves'],
      },
    },
    {
      name: 'undo_moves',
      description:
        'Go back N moves from the current position. Like a coach saying "let me rewind to show you another variation". After undoing, you can make different moves to show an alternative line.',
      parameters: {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description:
              'Number of moves to undo (default: 1). Use higher numbers to go back further.',
          },
        },
        required: [],
      },
    },
    {
      name: 'goto_move',
      description:
        'Navigate to a specific move in the game history by index. Use 0 for the starting position, 1 for after the first move, etc.',
      parameters: {
        type: 'object',
        properties: {
          moveIndex: {
            type: 'number',
            description: 'The move index to navigate to (0 = starting position)',
          },
        },
        required: ['moveIndex'],
      },
    },
    {
      name: 'set_position',
      description:
        'Set the board to a specific position using FEN notation. Useful for analyzing specific positions or puzzles.',
      parameters: {
        type: 'object',
        properties: {
          fen: {
            type: 'string',
            description: 'The position in FEN notation',
          },
        },
        required: ['fen'],
      },
    },

    // =============================================================================
    // ANNOTATION TOOLS (visual aids for teaching)
    // =============================================================================
    {
      name: 'draw_arrows',
      description:
        'Draw arrows on the board to show piece movements, threats, or ideas. Useful for explaining tactical motifs and strategic plans.',
      parameters: {
        type: 'object',
        properties: {
          arrows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string', description: 'Starting square (e.g., "e2")' },
                to: { type: 'string', description: 'Ending square (e.g., "e4")' },
                color: { type: 'string', description: 'Arrow color: green, red, blue, yellow' },
              },
              required: ['from', 'to'],
            },
            description:
              'Array of arrows: [{from: "e2", to: "e4", color: "green"}]. Colors: green, red, blue, yellow',
          },
          clearExisting: {
            type: 'boolean',
            description: 'Whether to clear existing arrows first (default: true)',
          },
        },
        required: ['arrows'],
      },
    },
    {
      name: 'highlight_squares',
      description:
        'Highlight squares on the board to emphasize important squares, weaknesses, or key positions.',
      parameters: {
        type: 'object',
        properties: {
          highlights: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                square: { type: 'string', description: 'Square to highlight (e.g., "e4")' },
                color: { type: 'string', description: 'Highlight color: yellow, green, red, blue' },
                type: {
                  type: 'string',
                  description: 'Highlight type: attack, defend, key, weak, theme',
                },
                label: { type: 'string', description: 'Optional label text' },
              },
              required: ['square'],
            },
            description:
              'Array of highlights: [{square: "e4", color: "yellow", type: "key"}]. Types: attack, defend, key, weak, theme',
          },
          clearExisting: {
            type: 'boolean',
            description: 'Whether to clear existing highlights first (default: true)',
          },
        },
        required: ['highlights'],
      },
    },
    {
      name: 'clear_annotations',
      description: 'Clear all arrows and highlights from the board.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },

    // =============================================================================
    // ANALYSIS TOOLS
    // =============================================================================
    {
      name: 'analyze_position',
      description:
        'Get Stockfish engine analysis of the current position. Returns evaluation (centipawns or mate), best move, and principal variation (top engine line). Use this for objective position assessment and to find tactics.',
      parameters: {
        type: 'object',
        properties: {
          depth: {
            type: 'number',
            description: 'Analysis depth (default: 20, higher = more accurate but slower)',
          },
        },
        required: [],
      },
    },

    // =============================================================================
    // TEACHING FLOW TOOLS
    // =============================================================================
    {
      name: 'ask_multiple_choice',
      description:
        'Stop and ask the user which direction they want to explore. Use this FREQUENTLY - after every major concept, demonstration, or position setup. This is the primary way to check in with the user. Options should be in plain English describing the idea, with chess notation in parentheses as a secondary reference. User can click an option, press 1-5, or type their own question to go a different direction.\n\nWhen FIRST introducing an opening, consider these high-value questions:\n- "Are there traps here our opponent might fall for?" (use explore_continuations/analyze_line to find lines where the game count drops sharply—that\'s where traps hide)\n- "Walk me through a model game" (use get_position_stats topGames + database stats to narrate the most common positions with commentary)\nThese give users both practical weapons and pattern understanding.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'A conversational question about what to explore next (e.g., "What would you like to see?" or "Which aspect interests you?")',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of 2-3 plain English options. Format: "Description of the idea (Nf6)" - e.g., ["See the main defensive line (Be7)", "Explore the aggressive counter (d5)", "Show me a common trap here", "Go back and try a different move"]',
          },
        },
        required: ['question', 'options'],
      },
    },
  ];
}

const openingDatabase = new OpeningDatabase();

// Context for tools that need harness-level coordination
export interface ToolContext {
  registerMultipleChoiceCancel?: (cancel: () => void) => void;
  clearMultipleChoiceCancel?: () => void;
}

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  gameManager: ChessManager,
  socket: ClientSocket,
  context?: ToolContext
): Promise<unknown> {
  switch (toolName) {
    // =============================================================================
    // PURE INFORMATION TOOLS
    // =============================================================================
    case 'get_position_stats': {
      const fen = gameManager.getFEN();
      const database = (args.database as LichessDatabase) || 'masters';
      const limit = (args.limit as number) || 5;

      try {
        // Get opening info from local database
        const info = await openingDatabase.getOpeningInfo(fen);

        // Get stats from Lichess API
        const explorer = getExplorer();
        const explorerResult =
          database === 'masters' ? await explorer.masters(fen) : await explorer.lichess(fen);

        // Emit explorer result to UI so it stays in sync with agent queries
        socket.emit('explorer:result', { result: explorerResult, database });

        const result: Record<string, unknown> = {
          database,
          fen,
        };

        // Add opening info if we have it locally or from API
        if (info) {
          result.opening = {
            name: info.name,
            eco: info.eco,
            moves: info.moves,
          };
        } else if (explorerResult.opening) {
          result.opening = {
            name: explorerResult.opening.name,
            eco: explorerResult.opening.eco,
          };
        }

        if (explorerResult.stats.totalGames > 0) {
          result.statistics = {
            totalGames: explorerResult.stats.totalGames,
            whiteWins: `${explorerResult.stats.whiteWinPercent.toFixed(1)}%`,
            draws: `${explorerResult.stats.drawPercent.toFixed(1)}%`,
            blackWins: `${explorerResult.stats.blackWinPercent.toFixed(1)}%`,
            topMoves: explorerResult.moves.slice(0, limit).map((m) => ({
              move: m.san,
              games: m.totalGames,
              playRate: `${m.playRate.toFixed(1)}%`,
              whiteWinRate: `${m.whiteWinPercent.toFixed(1)}%`,
              drawRate: `${m.drawPercent.toFixed(1)}%`,
              blackWinRate: `${m.blackWinPercent.toFixed(1)}%`,
              avgRating: m.averageRating,
            })),
          };

          // Add top games if available
          if (explorerResult.raw.topGames && explorerResult.raw.topGames.length > 0) {
            result.topGames = explorerResult.raw.topGames.slice(0, 3).map((g) => ({
              white: `${g.white.name} (${g.white.rating})`,
              black: `${g.black.name} (${g.black.rating})`,
              result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
              year: g.year,
            }));
          }
        } else {
          result.message = 'Position not found in database - may be an uncommon line';
        }

        return result;
      } catch (error) {
        return {
          error: 'Failed to query opening database',
          fen,
        };
      }
    }

    case 'get_current_position': {
      const state = gameManager.getState();
      const moveList = state.history
        .map((m: { san?: string }, i: number) => {
          const moveNum = Math.floor(i / 2) + 1;
          const isWhite = i % 2 === 0;
          return isWhite ? `${moveNum}. ${m.san}` : m.san;
        })
        .join(' ');

      return {
        fen: state.fen,
        turn: state.turn === 'w' ? 'White' : 'Black',
        moveNumber: state.currentMoveIndex,
        totalMoves: state.history.length,
        moves: moveList || 'Starting position',
        isCheck: state.isCheck,
        isCheckmate: state.isCheckmate,
        isStalemate: state.isStalemate,
        isDraw: state.isDraw,
      };
    }

    case 'explore_continuations': {
      const candidateMoves = args.moves as string[];
      const database = (args.database as LichessDatabase) || 'lichess';
      const currentFen = gameManager.getFEN();

      if (!candidateMoves || candidateMoves.length === 0) {
        return { error: 'No candidate moves provided' };
      }

      const explorer = getExplorer();
      const { Chess } = await import('chess.js');

      const results: Array<{
        move: string;
        resultingPosition: string | null;
        statistics: Record<string, unknown> | null;
        error?: string;
      }> = [];

      // For each candidate move, simulate it and get stats
      for (const moveStr of candidateMoves) {
        try {
          // Create a temporary game state to simulate the move
          const tempGame = new Chess(currentFen);

          // Try to make the move
          const move = tempGame.move(moveStr);
          if (!move) {
            results.push({
              move: moveStr,
              resultingPosition: null,
              statistics: null,
              error: `Invalid move: ${moveStr}`,
            });
            continue;
          }

          const resultingFen = tempGame.fen();

          // Query the explorer for the resulting position
          const explorerResult =
            database === 'masters'
              ? await explorer.masters(resultingFen)
              : await explorer.lichess(resultingFen);

          if (explorerResult.stats.totalGames > 0) {
            results.push({
              move: move.san,
              resultingPosition: resultingFen,
              statistics: {
                totalGames: explorerResult.stats.totalGames,
                whiteWins: `${explorerResult.stats.whiteWinPercent.toFixed(1)}%`,
                draws: `${explorerResult.stats.drawPercent.toFixed(1)}%`,
                blackWins: `${explorerResult.stats.blackWinPercent.toFixed(1)}%`,
                opening: explorerResult.opening,
                topResponses: explorerResult.moves.slice(0, 3).map((m) => ({
                  move: m.san,
                  games: m.totalGames,
                  whiteWinRate: `${m.whiteWinPercent.toFixed(1)}%`,
                })),
              },
            });
          } else {
            results.push({
              move: move.san,
              resultingPosition: resultingFen,
              statistics: null,
              error: 'Position not in database (rare or theoretical novelty)',
            });
          }
        } catch {
          results.push({
            move: moveStr,
            resultingPosition: null,
            statistics: null,
            error: `Failed to analyze move: ${moveStr}`,
          });
        }
      }

      return {
        currentPosition: currentFen,
        database,
        continuations: results,
        summary: `Explored ${results.length} candidate move(s) from current position`,
      };
    }

    case 'analyze_line': {
      const moves = args.moves as string[];
      const database = (args.database as LichessDatabase) || 'lichess';

      if (!moves || moves.length === 0) {
        return { error: 'No moves provided' };
      }

      const explorer = getExplorer();
      const { Chess } = await import('chess.js');
      const tempGame = new Chess(); // Start from initial position

      const lineAnalysis: Array<{
        moveNumber: number;
        move: string;
        fen: string;
        movingColor: 'white' | 'black';
        statistics: Record<string, unknown> | null;
        opening?: { eco: string; name: string };
      }> = [];

      // First, get stats for starting position
      try {
        const startResult =
          database === 'masters'
            ? await explorer.masters(tempGame.fen())
            : await explorer.lichess(tempGame.fen());

        lineAnalysis.push({
          moveNumber: 0,
          move: '(start)',
          fen: tempGame.fen(),
          movingColor: 'white',
          statistics:
            startResult.stats.totalGames > 0
              ? {
                  totalGames: startResult.stats.totalGames,
                  whiteWins: `${startResult.stats.whiteWinPercent.toFixed(1)}%`,
                  draws: `${startResult.stats.drawPercent.toFixed(1)}%`,
                  blackWins: `${startResult.stats.blackWinPercent.toFixed(1)}%`,
                }
              : null,
        });
      } catch {
        // Ignore start position errors
      }

      // Analyze each move in the line
      for (let i = 0; i < moves.length; i++) {
        const moveStr = moves[i];
        const movingColor = tempGame.turn();

        try {
          const move = tempGame.move(moveStr);
          if (!move) {
            lineAnalysis.push({
              moveNumber: i + 1,
              move: moveStr,
              fen: '',
              movingColor: movingColor === 'w' ? 'white' : 'black',
              statistics: null,
            });
            break; // Can't continue after invalid move
          }

          const fen = tempGame.fen();

          const explorerResult =
            database === 'masters' ? await explorer.masters(fen) : await explorer.lichess(fen);

          const entry: {
            moveNumber: number;
            move: string;
            fen: string;
            movingColor: 'white' | 'black';
            statistics: Record<string, unknown> | null;
            opening?: { eco: string; name: string };
          } = {
            moveNumber: i + 1,
            move: move.san,
            fen,
            movingColor: movingColor === 'w' ? 'white' : 'black',
            statistics:
              explorerResult.stats.totalGames > 0
                ? {
                    totalGames: explorerResult.stats.totalGames,
                    whiteWins: `${explorerResult.stats.whiteWinPercent.toFixed(1)}%`,
                    draws: `${explorerResult.stats.drawPercent.toFixed(1)}%`,
                    blackWins: `${explorerResult.stats.blackWinPercent.toFixed(1)}%`,
                    topMoves: explorerResult.moves.slice(0, 3).map((m) => ({
                      move: m.san,
                      games: m.totalGames,
                      playRate: `${m.playRate.toFixed(1)}%`,
                    })),
                  }
                : null,
          };

          if (explorerResult.opening) {
            entry.opening = explorerResult.opening;
          }

          lineAnalysis.push(entry);
        } catch {
          lineAnalysis.push({
            moveNumber: i + 1,
            move: moveStr,
            fen: '',
            movingColor: movingColor === 'w' ? 'white' : 'black',
            statistics: null,
          });
          break;
        }
      }

      // Find where the line becomes rare
      let rarenessThreshold = null;
      for (let i = 1; i < lineAnalysis.length; i++) {
        const current = lineAnalysis[i];
        const prev = lineAnalysis[i - 1];
        if (prev.statistics && current.statistics) {
          const prevGames = (prev.statistics as { totalGames: number }).totalGames;
          const currGames = (current.statistics as { totalGames: number }).totalGames;
          if (currGames < prevGames * 0.1) {
            // 90% drop-off
            rarenessThreshold = {
              afterMove: i,
              move: current.move,
              gamesDrop: `${prevGames} → ${currGames}`,
            };
            break;
          }
        } else if (prev.statistics && !current.statistics) {
          rarenessThreshold = {
            afterMove: i,
            move: current.move,
            gamesDrop: 'Position not in database',
          };
          break;
        }
      }

      return {
        database,
        line: moves.join(' '),
        analysis: lineAnalysis,
        rarenessThreshold,
        summary: rarenessThreshold
          ? `Line becomes rare after move ${rarenessThreshold.afterMove} (${rarenessThreshold.move}): ${rarenessThreshold.gamesDrop}`
          : `All ${moves.length} moves are well-represented in the ${database} database`,
      };
    }

    // =============================================================================
    // BOARD PRIMITIVE TOOLS
    // =============================================================================
    case 'reset_board': {
      gameManager.reset();
      socket.emit('game:state', gameManager.getState());
      return {
        success: true,
        message: 'Board reset to starting position',
        fen: gameManager.getFEN(),
      };
    }

    case 'make_move': {
      const moveStr = args.move as string;
      let from: string, to: string, promotion: string | undefined;

      // Try to parse UCI format (e.g., e2e4)
      if (moveStr.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(moveStr)) {
        from = moveStr.slice(0, 2);
        to = moveStr.slice(2, 4);
        if (moveStr.length === 5) {
          promotion = moveStr[4];
        }
      } else {
        // Try SAN format - get legal moves and find match
        const legalMoves = gameManager.getLegalMoves();
        const match = legalMoves.find((m) => m.san === moveStr);
        if (match) {
          from = match.from;
          to = match.to;
          promotion = match.promotion;
        } else {
          return { error: `Invalid move: ${moveStr}` };
        }
      }

      const result = gameManager.makeMove(from, to, promotion as any);
      if (result) {
        socket.emit('game:state', gameManager.getState());
        return {
          success: true,
          move: result.san,
          fen: gameManager.getFEN(),
          turn: gameManager.getTurn() === 'w' ? 'White' : 'Black',
        };
      }
      return { error: `Invalid move: ${moveStr}` };
    }

    case 'make_moves': {
      const movesInput = args.moves as string[];
      const animate = args.animate !== false; // Default to true
      const delayMs = Math.min(2500, Math.max(500, (args.delayMs as number) || 1000));
      const description = args.description as string | undefined;

      if (!movesInput || movesInput.length === 0) {
        return { error: 'No moves provided' };
      }

      if (animate) {
        // Emit animation start event
        socket.emit('animation:start', {
          moves: movesInput,
          delayMs,
          description,
          startFen: gameManager.getFEN(),
        });

        // Process moves one by one with delays
        const processedMoves: string[] = [];

        for (let i = 0; i < movesInput.length; i++) {
          const moveStr = movesInput[i];

          // Wait for the delay (except for first move)
          if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }

          // Try to make the move (SAN format first)
          const legalMoves = gameManager.getLegalMoves();
          let match = legalMoves.find((m) => m.san === moveStr);

          if (match) {
            const result = gameManager.makeMove(match.from, match.to, match.promotion as any);
            if (result) {
              processedMoves.push(result.san || '');
              socket.emit('animation:move', {
                moveIndex: i,
                totalMoves: movesInput.length,
                san: result.san || '',
                state: gameManager.getState(),
              });
            } else {
              break;
            }
          } else {
            // Try UCI format
            if (moveStr.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(moveStr)) {
              const from = moveStr.slice(0, 2);
              const to = moveStr.slice(2, 4);
              const promotion = moveStr.length === 5 ? moveStr[4] : undefined;
              const result = gameManager.makeMove(from, to, promotion as any);
              if (result) {
                processedMoves.push(result.san || '');
                socket.emit('animation:move', {
                  moveIndex: i,
                  totalMoves: movesInput.length,
                  san: result.san || '',
                  state: gameManager.getState(),
                });
              } else {
                break;
              }
            } else {
              break;
            }
          }
        }

        // Signal animation complete
        socket.emit('animation:complete', {
          movesPlayed: processedMoves.length,
          totalMoves: movesInput.length,
        });

        return {
          success: true,
          animated: true,
          movesPlayed: processedMoves,
          totalMoves: movesInput.length,
          fen: gameManager.getFEN(),
          description: description,
        };
      } else {
        // Instant execution (no animation)
        const processedMoves: string[] = [];

        for (const moveStr of movesInput) {
          const legalMoves = gameManager.getLegalMoves();
          let match = legalMoves.find((m) => m.san === moveStr);

          if (match) {
            const result = gameManager.makeMove(match.from, match.to, match.promotion as any);
            if (result) {
              processedMoves.push(result.san || '');
            } else {
              break;
            }
          } else if (moveStr.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(moveStr)) {
            const from = moveStr.slice(0, 2);
            const to = moveStr.slice(2, 4);
            const promotion = moveStr.length === 5 ? moveStr[4] : undefined;
            const result = gameManager.makeMove(from, to, promotion as any);
            if (result) {
              processedMoves.push(result.san || '');
            } else {
              break;
            }
          } else {
            break;
          }
        }

        socket.emit('game:state', gameManager.getState());

        return {
          success: true,
          animated: false,
          movesPlayed: processedMoves,
          totalMoves: movesInput.length,
          fen: gameManager.getFEN(),
        };
      }
    }

    case 'undo_moves': {
      const count = Math.max(1, (args.count as number) || 1);
      const currentIndex = gameManager.getState().currentMoveIndex;
      const newIndex = Math.max(0, currentIndex - count);

      try {
        gameManager.navigateToMove(newIndex);
        socket.emit('game:state', gameManager.getState());

        return {
          success: true,
          message: `Went back ${currentIndex - newIndex} move(s)`,
          previousMoveIndex: currentIndex,
          currentMoveIndex: newIndex,
          fen: gameManager.getFEN(),
          turn: gameManager.getTurn() === 'w' ? 'White' : 'Black',
        };
      } catch (error) {
        return { error: `Failed to undo moves` };
      }
    }

    case 'goto_move': {
      const index = args.moveIndex as number;
      try {
        gameManager.navigateToMove(index);
        socket.emit('game:state', gameManager.getState());
        return {
          success: true,
          moveIndex: index,
          fen: gameManager.getFEN(),
          turn: gameManager.getTurn() === 'w' ? 'White' : 'Black',
        };
      } catch (error) {
        return { error: `Invalid move index: ${index}` };
      }
    }

    case 'set_position': {
      const fen = args.fen as string;
      try {
        gameManager.loadFEN(fen);
        socket.emit('game:state', gameManager.getState());
        return {
          success: true,
          message: 'Position set',
          fen: gameManager.getFEN(),
          turn: gameManager.getTurn() === 'w' ? 'White' : 'Black',
        };
      } catch (error) {
        return { error: `Invalid FEN: ${fen}` };
      }
    }

    // =============================================================================
    // ANNOTATION TOOLS
    // =============================================================================
    case 'draw_arrows': {
      const arrowsInput = args.arrows as Array<{ from: string; to: string; color?: string }>;
      const clearExisting = args.clearExisting !== false;

      // Validate arrows - filter out any with missing from/to (can happen with malformed AI responses)
      const validArrows = (arrowsInput || []).filter((a) => {
        const isValid =
          a &&
          typeof a.from === 'string' &&
          typeof a.to === 'string' &&
          a.from.length >= 2 &&
          a.to.length >= 2;
        if (!isValid) {
          console.warn('[draw_arrows] Filtering invalid arrow:', a);
        }
        return isValid;
      });

      const arrows: BoardArrow[] = validArrows.map((a) => ({
        from: a.from,
        to: a.to,
        color: (a.color as BoardArrow['color']) || 'green',
      }));

      if (clearExisting) {
        socket.emit('board:clearAnnotations');
      }

      socket.emit('board:annotations', { arrows, highlights: [] });

      return {
        success: true,
        message: `Drew ${arrows.length} arrow(s) on the board`,
        arrows: arrows.map((a) => `${a.from} → ${a.to} (${a.color})`),
      };
    }

    case 'highlight_squares': {
      const highlightsInput = args.highlights as Array<{
        square: string;
        color?: string;
        type?: string;
        label?: string;
      }>;
      const clearExisting = args.clearExisting !== false;

      const highlights: SquareHighlight[] = highlightsInput.map((h) => ({
        square: h.square,
        color: (h.color as SquareHighlight['color']) || 'yellow',
        type: (h.type as SquareHighlight['type']) || 'key',
        label: h.label,
      }));

      if (clearExisting) {
        socket.emit('board:clearAnnotations');
      }

      socket.emit('board:annotations', { arrows: [], highlights });

      return {
        success: true,
        message: `Highlighted ${highlights.length} square(s)`,
        highlights: highlights.map((h) => `${h.square} (${h.type}, ${h.color})`),
      };
    }

    case 'clear_annotations': {
      socket.emit('board:clearAnnotations');
      return { success: true, message: 'Cleared all annotations from the board' };
    }

    // =============================================================================
    // ANALYSIS TOOLS
    // =============================================================================
    case 'analyze_position': {
      const depth = (args.depth as number) || 20;
      const stockfish = getStockfishService();

      // Initialize if not ready
      if (!stockfish.isReady()) {
        try {
          await stockfish.init();
        } catch (initError) {
          return { error: 'Engine initialization failed - Stockfish may not be installed' };
        }
      }

      try {
        const result = await stockfish.analyze(gameManager.getFEN(), { depth });
        const line = result.lines[0];

        // Convert to legacy format for client
        const score = line?.score.type === 'cp' ? line.score.value / 100 : 0;
        const mate = line?.score.type === 'mate' ? line.score.value : null;

        socket.emit('analysis:result', {
          fen: result.fen,
          depth: line?.depth || depth,
          score,
          mate,
          bestMove: result.bestMove,
          pv: line?.moves || [],
          time: result.totalTime,
        });

        return {
          evaluation: mate ? `Mate in ${mate}` : `${score > 0 ? '+' : ''}${score.toFixed(2)}`,
          bestMove: result.bestMove,
          depth: line?.depth || depth,
          principalVariation: (line?.moves || []).join(' '),
          analysisTime: `${result.totalTime}ms`,
        };
      } catch (error) {
        return { error: 'Analysis failed' };
      }
    }

    // =============================================================================
    // TEACHING FLOW TOOLS
    // =============================================================================
    case 'ask_multiple_choice': {
      // Extract question - handle potential {description, value} wrapper from Gemini
      const questionRaw = args.question;
      const question =
        typeof questionRaw === 'object' && questionRaw !== null && 'value' in questionRaw
          ? String((questionRaw as { value: unknown }).value)
          : String(questionRaw || '');

      // Extract options - handle both string[] and object[] formats from different AI providers
      // Gemini sends {text: "..."}, others may send {value: "..."} or {description: "..."}
      const optionsRaw = args.options as unknown[];
      const options: string[] = (optionsRaw || []).map((opt) => {
        if (typeof opt === 'string') return opt;
        if (typeof opt === 'object' && opt !== null) {
          // Handle various object wrapper formats from different AI providers
          if ('text' in opt) return String((opt as { text: unknown }).text);
          if ('value' in opt) return String((opt as { value: unknown }).value);
          if ('description' in opt) return String((opt as { description: unknown }).description);
        }
        return String(opt);
      });

      const questionId = `question-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      if (!options || options.length < 2 || options.length > 5) {
        return { error: 'Options must be an array of 2-5 choices' };
      }

      // Emit multiple choice event to client
      socket.emit('conversation:multipleChoice', {
        conversationId: '',
        questionId,
        question,
        options,
      });

      // Wait for user answer, dismiss, cancellation, or timeout (max 5 minutes)
      return new Promise((resolve) => {
        let isResolved = false;

        const timeout = setTimeout(() => {
          if (isResolved) return;
          cleanup();
          resolve({
            success: true,
            answered: false,
            reason: 'timeout',
            message: 'User did not answer within timeout period',
          });
        }, 5 * 60 * 1000);

        const cleanup = () => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(timeout);
          socket.off('conversation:answer', answerHandler);
          socket.off('conversation:dismissPrompt', dismissHandler);
          // Clear the cancel callback from harness
          context?.clearMultipleChoiceCancel?.();
        };

        const answerHandler = (payload: { questionId: string; answerIndex: number }) => {
          if (payload.questionId === questionId && !isResolved) {
            cleanup();
            const selectedOption = options[payload.answerIndex];
            resolve({
              success: true,
              answered: true,
              answerIndex: payload.answerIndex,
              selectedOption,
              message: `User selected option ${payload.answerIndex + 1}: ${selectedOption}`,
              // Flag to signal that user interaction occurred - harness should reset reasoning mode
              userInteracted: true,
            });
          }
        };

        const dismissHandler = (receivedQuestionId: string) => {
          if (receivedQuestionId === questionId && !isResolved) {
            cleanup();
            // Fire and forget - resolve with a flag that tells harness to stop the loop
            resolve({
              success: true,
              answered: false,
              reason: 'dismissed',
              message: 'User dismissed the question',
              // Signal to harness: don't continue the agent loop, just stop
              stopLoop: true,
            });
          }
        };

        // External cancellation handler (when user sends a new message)
        const cancelHandler = () => {
          if (isResolved) return;
          cleanup();
          // When cancelled by new message, resolve with cancelled flag
          // The harness will ignore this result and process the new message
          resolve({
            success: false,
            answered: false,
            reason: 'cancelled',
            message: 'Question cancelled by new user message',
            cancelled: true,
          });
        };

        // Register the cancel callback with the harness
        context?.registerMultipleChoiceCancel?.(cancelHandler);

        socket.on('conversation:answer', answerHandler);
        socket.on('conversation:dismissPrompt', dismissHandler);
      });
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
