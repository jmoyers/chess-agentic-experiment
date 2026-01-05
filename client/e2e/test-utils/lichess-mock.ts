/**
 * Lichess Opening Explorer API Mock
 * 
 * This module provides mock responses for the Lichess Explorer API
 * to avoid hitting the real API during E2E tests.
 * 
 * Rate limits for real API:
 * - Masters database: ~15 requests/minute
 * - Lichess database: ~15 requests/minute
 */

import { Page, Route } from '@playwright/test';

// API endpoints to mock
const LICHESS_EXPLORER_URLS = [
  'https://explorer.lichess.ovh/masters',
  'https://explorer.lichess.ovh/lichess',
  'https://explorer.lichess.ovh/player',
];

/**
 * Mock response for the starting position
 */
export const STARTING_POSITION_RESPONSE = {
  white: 1547782,
  draws: 540672,
  black: 612203,
  moves: [
    {
      uci: 'e2e4',
      san: 'e4',
      white: 745123,
      draws: 245678,
      black: 289012,
      averageRating: 2450,
    },
    {
      uci: 'd2d4',
      san: 'd4',
      white: 523456,
      draws: 189234,
      black: 198765,
      averageRating: 2470,
    },
    {
      uci: 'g1f3',
      san: 'Nf3',
      white: 156789,
      draws: 67890,
      black: 78901,
      averageRating: 2420,
    },
    {
      uci: 'c2c4',
      san: 'c4',
      white: 98765,
      draws: 34567,
      black: 42345,
      averageRating: 2480,
    },
  ],
  topGames: [
    {
      id: 'mock001',
      white: { name: 'Carlsen, Magnus', rating: 2882 },
      black: { name: 'Caruana, Fabiano', rating: 2820 },
      winner: 'white',
      year: 2023,
      month: 6,
    },
    {
      id: 'mock002',
      white: { name: 'Ding, Liren', rating: 2805 },
      black: { name: 'Nepomniachtchi, Ian', rating: 2795 },
      winner: null,
      year: 2023,
      month: 4,
    },
  ],
  opening: null,
};

/**
 * Mock response for 1. e4 position
 */
export const E4_POSITION_RESPONSE = {
  white: 745123,
  draws: 245678,
  black: 289012,
  moves: [
    {
      uci: 'e7e5',
      san: 'e5',
      white: 234567,
      draws: 89012,
      black: 98765,
      averageRating: 2440,
    },
    {
      uci: 'c7c5',
      san: 'c5',
      white: 198765,
      draws: 67890,
      black: 89012,
      averageRating: 2460,
    },
    {
      uci: 'e7e6',
      san: 'e6',
      white: 123456,
      draws: 45678,
      black: 56789,
      averageRating: 2420,
    },
    {
      uci: 'c7c6',
      san: 'c6',
      white: 98765,
      draws: 34567,
      black: 45678,
      averageRating: 2430,
    },
  ],
  topGames: [
    {
      id: 'mock003',
      white: { name: 'Kasparov, Garry', rating: 2851 },
      black: { name: 'Karpov, Anatoly', rating: 2780 },
      winner: 'white',
      year: 1990,
      month: 10,
    },
  ],
  opening: {
    eco: 'B00',
    name: "King's Pawn Opening",
  },
};

/**
 * Mock response for the Sicilian Defense (1. e4 c5)
 */
export const SICILIAN_POSITION_RESPONSE = {
  white: 198765,
  draws: 67890,
  black: 89012,
  moves: [
    {
      uci: 'g1f3',
      san: 'Nf3',
      white: 123456,
      draws: 45678,
      black: 56789,
      averageRating: 2480,
    },
    {
      uci: 'b1c3',
      san: 'Nc3',
      white: 34567,
      draws: 12345,
      black: 15678,
      averageRating: 2420,
    },
    {
      uci: 'c2c3',
      san: 'c3',
      white: 23456,
      draws: 8901,
      black: 11234,
      averageRating: 2390,
    },
  ],
  topGames: [
    {
      id: 'mock004',
      white: { name: 'Fischer, Bobby', rating: 2785 },
      black: { name: 'Spassky, Boris', rating: 2660 },
      winner: 'white',
      year: 1972,
      month: 7,
    },
  ],
  opening: {
    eco: 'B20',
    name: 'Sicilian Defense',
  },
};

/**
 * Mock response for 1. d4 position (London/Queen's Gambit territory)
 */
export const D4_POSITION_RESPONSE = {
  white: 523456,
  draws: 189234,
  black: 198765,
  moves: [
    {
      uci: 'd7d5',
      san: 'd5',
      white: 234567,
      draws: 89012,
      black: 87654,
      averageRating: 2460,
    },
    {
      uci: 'g8f6',
      san: 'Nf6',
      white: 178901,
      draws: 67890,
      black: 76543,
      averageRating: 2470,
    },
    {
      uci: 'e7e6',
      san: 'e6',
      white: 56789,
      draws: 23456,
      black: 21098,
      averageRating: 2420,
    },
  ],
  topGames: [
    {
      id: 'mock005',
      white: { name: 'Kramnik, Vladimir', rating: 2800 },
      black: { name: 'Anand, Viswanathan', rating: 2792 },
      winner: null,
      year: 2008,
      month: 10,
    },
  ],
  opening: {
    eco: 'D00',
    name: "Queen's Pawn Opening",
  },
};

/**
 * Mock response for Jobava London (1. d4 d5 2. Nc3)
 */
export const JOBAVA_LONDON_RESPONSE = {
  white: 34567,
  draws: 12345,
  black: 11234,
  moves: [
    {
      uci: 'g8f6',
      san: 'Nf6',
      white: 15678,
      draws: 5678,
      black: 4567,
      averageRating: 2380,
    },
    {
      uci: 'c7c6',
      san: 'c6',
      white: 8901,
      draws: 3456,
      black: 2789,
      averageRating: 2350,
    },
    {
      uci: 'e7e6',
      san: 'e6',
      white: 6789,
      draws: 2345,
      black: 2678,
      averageRating: 2340,
    },
  ],
  topGames: [
    {
      id: 'mock006',
      white: { name: 'Jobava, Baadur', rating: 2700 },
      black: { name: 'So, Wesley', rating: 2765 },
      winner: 'white',
      year: 2020,
      month: 3,
    },
  ],
  opening: {
    eco: 'D00',
    name: 'Jobava London System',
  },
};

/**
 * Default empty response for unknown positions
 */
export const EMPTY_POSITION_RESPONSE = {
  white: 0,
  draws: 0,
  black: 0,
  moves: [],
  topGames: [],
  opening: null,
};

/**
 * FEN to response mapping
 */
const FEN_RESPONSES: Record<string, typeof STARTING_POSITION_RESPONSE> = {
  // Starting position
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1': STARTING_POSITION_RESPONSE,
  // After 1. e4
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1': E4_POSITION_RESPONSE,
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1': E4_POSITION_RESPONSE,
  // After 1. e4 c5 (Sicilian)
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2': SICILIAN_POSITION_RESPONSE,
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2': SICILIAN_POSITION_RESPONSE,
  // After 1. d4
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1': D4_POSITION_RESPONSE,
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1': D4_POSITION_RESPONSE,
  // After 1. d4 d5 2. Nc3 (Jobava London setup)
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/2N5/PPP1PPPP/R1BQKBNR b KQkq - 1 2': JOBAVA_LONDON_RESPONSE,
};

/**
 * Get mock response for a given FEN position
 */
function getMockResponse(fen: string): typeof STARTING_POSITION_RESPONSE {
  // Try exact match first
  if (FEN_RESPONSES[fen]) {
    return FEN_RESPONSES[fen];
  }
  
  // Try matching without move counters (last two numbers in FEN)
  const fenBase = fen.replace(/\s+\d+\s+\d+$/, '');
  for (const [key, value] of Object.entries(FEN_RESPONSES)) {
    const keyBase = key.replace(/\s+\d+\s+\d+$/, '');
    if (keyBase === fenBase) {
      return value;
    }
  }
  
  return EMPTY_POSITION_RESPONSE;
}

/**
 * Setup Lichess API mocking for a Playwright page
 * 
 * @example
 * ```ts
 * test.beforeEach(async ({ page }) => {
 *   await setupLichessMock(page);
 *   await page.goto('/');
 * });
 * ```
 */
export async function setupLichessMock(page: Page): Promise<void> {
  // Mock all Lichess Explorer API endpoints
  for (const baseUrl of LICHESS_EXPLORER_URLS) {
    await page.route(`${baseUrl}**`, async (route: Route) => {
      const url = new URL(route.request().url());
      const fen = url.searchParams.get('fen') || '';
      
      // Add a small delay to simulate network latency (50-150ms)
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      
      const mockResponse = getMockResponse(fen);
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse),
      });
    });
  }
  
  // Also mock game PGN fetches
  await page.route('https://lichess.org/game/export/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/x-chess-pgn',
      body: `[Event "Mock Game"]
[Site "lichess.org"]
[Date "2023.01.01"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0`,
    });
  });
}

/**
 * Add a custom mock response for a specific FEN
 * Useful for testing specific positions in individual tests
 */
export function addMockResponse(fen: string, response: typeof STARTING_POSITION_RESPONSE): void {
  FEN_RESPONSES[fen] = response;
}

/**
 * Clear all custom mock responses (keeps defaults)
 */
export function resetMockResponses(): void {
  // Reset to original defaults by removing any dynamic additions
  const defaultFens = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1',
    'rnbqkbnr/ppp1pppp/8/3p4/3P4/2N5/PPP1PPPP/R1BQKBNR b KQkq - 1 2',
  ];
  
  for (const key of Object.keys(FEN_RESPONSES)) {
    if (!defaultFens.includes(key)) {
      delete FEN_RESPONSES[key];
    }
  }
}

