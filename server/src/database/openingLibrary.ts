import type { OpeningLine, OpeningTreeNode, OpeningVariation } from '@chess/shared';

// Comprehensive opening library with variations and common responses
export const OPENING_LIBRARY: OpeningLine[] = [
  // === D4 OPENINGS ===
  {
    id: 'london-system',
    name: 'London System',
    eco: 'D00',
    moves: '1. d4 d5 2. Bf4',
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR b KQkq - 1 2',
    description: 'A solid system opening where White develops the dark-squared bishop before playing e3. Very flexible and hard to prepare against.',
    themes: ['solid', 'system', 'anti-theory'],
    variations: [
      {
        id: 'london-main',
        name: 'Main Line',
        moves: '1. d4 d5 2. Bf4 Nf6 3. e3 c5 4. c3 Nc6 5. Nd2',
        fen: 'r1bqkb1r/pp2pppp/2n2n2/2pp4/3P1B2/2P1P3/PP1N1PPP/R2QKBNR b KQkq - 1 5',
        description: 'The classic London setup with a solid pawn structure.',
      },
      {
        id: 'london-aggressive',
        name: 'Aggressive Variation',
        moves: '1. d4 d5 2. Bf4 Nf6 3. e3 c5 4. Nc3',
        fen: 'rnbqkb1r/pp2pppp/5n2/2pp4/3P1B2/2N1P3/PPP2PPP/R2QKBNR b KQkq - 1 4',
        description: 'A more aggressive approach with Nc3 instead of c3.',
      },
    ],
  },
  {
    id: 'jobava-london',
    name: 'Jobava London',
    eco: 'D00',
    moves: '1. d4 d5 2. Nc3 Nf6 3. Bf4',
    fen: 'rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/2N5/PPP1PPPP/R2QKBNR b KQkq - 2 3',
    description: 'An aggressive variation of the London System named after GM Baadur Jobava. Combines London bishop development with early Nc3 for more dynamic play.',
    themes: ['aggressive', 'attacking', 'dynamic'],
    variations: [
      {
        id: 'jobava-main',
        name: 'Main Line',
        moves: '1. d4 d5 2. Nc3 Nf6 3. Bf4 c5 4. e3 cxd4 5. exd4 a6',
        fen: 'rnbqkb1r/1p2pppp/p4n2/3p4/3P1B2/2N5/PPP2PPP/R2QKBNR w KQkq - 0 6',
        description: 'Black challenges the center immediately.',
        response: 'White typically plays 6. Nf3 followed by Bd3 and O-O',
      },
      {
        id: 'jobava-e6',
        name: 'Solid ...e6 Response',
        moves: '1. d4 d5 2. Nc3 Nf6 3. Bf4 e6 4. e3 Bd6',
        fen: 'rnbqk2r/ppp2ppp/3bpn2/3p4/3P1B2/2N1P3/PPP2PPP/R2QKBNR w KQkq - 1 5',
        description: 'Black plays solidly and challenges the bishop.',
        response: 'After 5. Bxd6 cxd6, White has the bishop pair but Black has solid structure.',
      },
      {
        id: 'jobava-c6',
        name: 'Caro-Kann Setup',
        moves: '1. d4 d5 2. Nc3 Nf6 3. Bf4 c6 4. e3 Bf5',
        fen: 'rn1qkb1r/pp2pppp/2p2n2/3p1b2/3P1B2/2N1P3/PPP2PPP/R2QKBNR w KQkq - 1 5',
        description: 'Black develops bishop outside the pawn chain.',
        response: 'White often continues with Nf3, Bd3, and h3 to prevent ...Bg4.',
      },
      {
        id: 'jobava-g6',
        name: 'Fianchetto Defense',
        moves: '1. d4 d5 2. Nc3 Nf6 3. Bf4 g6 4. e3 Bg7',
        fen: 'rnbqk2r/ppp1ppbp/5np1/3p4/3P1B2/2N1P3/PPP2PPP/R2QKBNR w KQkq - 1 5',
        description: 'Black fianchettoes and prepares ...c5 or ...c6.',
        response: 'White can play Qd2, O-O-O for aggressive play, or Nf3, Be2, O-O for solid play.',
      },
    ],
  },
  // === CARO-KANN ===
  {
    id: 'caro-kann',
    name: 'Caro-Kann Defense',
    eco: 'B10',
    moves: '1. e4 c6',
    fen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    description: 'A solid defense where Black prepares ...d5 with the support of c6. Known for its solidity and strategic complexity.',
    themes: ['solid', 'strategic', 'anti-e4'],
    variations: [
      {
        id: 'caro-advance',
        name: 'Advance Variation',
        moves: '1. e4 c6 2. d4 d5 3. e5',
        fen: 'rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3',
        description: 'White gains space but Black gets counterplay on the queenside.',
        response: 'Black typically plays ...Bf5, ...e6, ...c5 targeting the d4 pawn.',
      },
      {
        id: 'caro-classical',
        name: 'Classical Variation',
        moves: '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5',
        fen: 'rn1qkbnr/pp2pppp/2p5/5b2/3PN3/8/PPP2PPP/R1BQKBNR w KQkq - 1 5',
        description: 'The main line where Black develops the bishop before ...e6.',
        response: 'White plays 5. Ng3 Bg6 6. h4 to gain space on the kingside.',
      },
      {
        id: 'caro-tartakower',
        name: 'Tartakower/Modern Variation',
        moves: '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6',
        fen: 'rnbqkb1r/pp2pppp/2p2n2/8/3PN3/8/PPP2PPP/R1BQKBNR w KQkq - 1 5',
        description: 'Black develops knight first, accepting doubled pawns after Nxf6+.',
        response: '5. Nxf6+ exf6 or 5...gxf6 - Black gets active pieces for pawn structure.',
      },
      {
        id: 'caro-exchange',
        name: 'Exchange Variation',
        moves: '1. e4 c6 2. d4 d5 3. exd5 cxd5',
        fen: 'rnbqkbnr/pp2pppp/8/3p4/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4',
        description: 'Symmetrical pawn structure. Often leads to simplified positions.',
        response: 'Both sides develop normally. Black should avoid ...Bf5 too early.',
      },
      {
        id: 'caro-fantasy',
        name: 'Fantasy Variation',
        moves: '1. e4 c6 2. d4 d5 3. f3',
        fen: 'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/5P2/PPP3PP/RNBQKBNR b KQkq - 0 3',
        description: 'Aggressive setup supporting e4 with f3.',
        response: 'Black plays ...dxe4 fxe4 ...e5 to challenge the center.',
      },
      {
        id: 'caro-two-knights',
        name: 'Two Knights Variation',
        moves: '1. e4 c6 2. Nf3 d5 3. Nc3',
        fen: 'rnbqkbnr/pp2pppp/2p5/3p4/4P3/2N2N2/PPPP1PPP/R1BQKB1R b KQkq - 2 3',
        description: 'White develops knights before committing to d4.',
        response: 'Black can play ...Bg4 or ...dxe4 followed by ...Bf5.',
      },
    ],
  },
  // === SICILIAN ===
  {
    id: 'sicilian-defense',
    name: 'Sicilian Defense',
    eco: 'B20',
    moves: '1. e4 c5',
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
    description: 'The most popular and best-scoring response to 1.e4. Creates asymmetrical positions with chances for both sides.',
    themes: ['sharp', 'counterattacking', 'asymmetrical'],
    variations: [
      {
        id: 'sicilian-open',
        name: 'Open Sicilian',
        moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4',
        fen: 'rnbqkbnr/pp2pppp/3p4/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4',
        description: 'The main line leading to sharp tactical play.',
      },
      {
        id: 'sicilian-najdorf',
        name: 'Najdorf Variation',
        moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
        fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
        description: 'The most popular and complex Sicilian line.',
      },
      {
        id: 'sicilian-dragon',
        name: 'Dragon Variation',
        moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6',
        fen: 'rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
        description: 'Black fianchettoes the bishop on g7 creating a "dragon" shape.',
      },
    ],
  },
  // === FRENCH DEFENSE ===
  {
    id: 'french-defense',
    name: 'French Defense',
    eco: 'C00',
    moves: '1. e4 e6',
    fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    description: 'A solid defense where Black prepares ...d5. The light-squared bishop is often hemmed in.',
    themes: ['solid', 'strategic', 'pawn-chain'],
    variations: [
      {
        id: 'french-advance',
        name: 'Advance Variation',
        moves: '1. e4 e6 2. d4 d5 3. e5',
        fen: 'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3',
        description: 'White gains space. Black attacks the pawn chain with ...c5.',
      },
      {
        id: 'french-winawer',
        name: 'Winawer Variation',
        moves: '1. e4 e6 2. d4 d5 3. Nc3 Bb4',
        fen: 'rnbqk1nr/ppp2ppp/4p3/3p4/1b1PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 2 4',
        description: 'Sharp and complex. Black pins the knight.',
      },
    ],
  },
  // === RUY LOPEZ ===
  {
    id: 'ruy-lopez',
    name: 'Ruy Lopez (Spanish Opening)',
    eco: 'C60',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5',
    fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    description: 'One of the oldest and most classic openings. Rich in strategic and tactical possibilities.',
    themes: ['classical', 'strategic', 'positional'],
    variations: [
      {
        id: 'ruy-morphy',
        name: 'Morphy Defense',
        moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O',
        fen: 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 1 5',
        description: 'The main line of the Ruy Lopez.',
      },
      {
        id: 'ruy-berlin',
        name: 'Berlin Defense',
        moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        description: 'Super solid defense, popularized in world championships.',
      },
    ],
  },
  // === ITALIAN GAME ===
  {
    id: 'italian-game',
    name: 'Italian Game',
    eco: 'C50',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    description: 'One of the oldest openings. White develops naturally targeting f7.',
    themes: ['attacking', 'tactical', 'classical'],
    variations: [
      {
        id: 'italian-giuoco-piano',
        name: 'Giuoco Piano',
        moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5',
        fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        description: 'The "quiet game" - positional maneuvering.',
      },
      {
        id: 'italian-two-knights',
        name: 'Two Knights Defense',
        moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        description: 'Active defense with early piece development.',
      },
    ],
  },
  // === QUEEN'S GAMBIT ===
  {
    id: 'queens-gambit',
    name: "Queen's Gambit",
    eco: 'D00',
    moves: '1. d4 d5 2. c4',
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2',
    description: 'A classical opening offering a pawn for central control and piece activity.',
    themes: ['classical', 'positional', 'strategic'],
    variations: [
      {
        id: 'qgd-declined',
        name: "Queen's Gambit Declined",
        moves: '1. d4 d5 2. c4 e6',
        fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
        description: 'Solid defense maintaining the center.',
      },
      {
        id: 'qgd-accepted',
        name: "Queen's Gambit Accepted",
        moves: '1. d4 d5 2. c4 dxc4',
        fen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
        description: 'Black accepts the pawn but must develop actively.',
      },
      {
        id: 'qgd-slav',
        name: 'Slav Defense',
        moves: '1. d4 d5 2. c4 c6',
        fen: 'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
        description: 'Solid defense keeping the light-squared bishop free.',
      },
    ],
  },
  // === KING'S INDIAN ===
  {
    id: 'kings-indian',
    name: "King's Indian Defense",
    eco: 'E60',
    moves: '1. d4 Nf6 2. c4 g6',
    fen: 'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
    description: 'A hypermodern defense allowing White to build a center, then counterattacking.',
    themes: ['hypermodern', 'attacking', 'dynamic'],
    variations: [
      {
        id: 'kid-classical',
        name: 'Classical Variation',
        moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2',
        fen: 'rnbq1rk1/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP2BPPP/R1BQK2R b KQ - 3 6',
        description: 'The main classical setup.',
      },
      {
        id: 'kid-samisch',
        name: 'Sämisch Variation',
        moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f3',
        fen: 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N2P2/PP4PP/R1BQKBNR b KQkq - 0 5',
        description: 'White plays f3 to support e4 and prepare Be3, Qd2, O-O-O.',
      },
    ],
  },
];

// Build opening tree for a given opening
export function buildOpeningTree(openingId: string): OpeningTreeNode | null {
  const opening = OPENING_LIBRARY.find(o => o.id === openingId);
  if (!opening) return null;

  // Parse the main line moves
  const mainMoves = parseMoves(opening.moves);
  
  // Create root node
  const root: OpeningTreeNode = {
    san: 'Start',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    children: [],
    isMainLine: true,
  };

  let currentNode = root;
  let currentFen = root.fen;

  // Build main line
  for (const san of mainMoves) {
    const newFen = applyMoveToFen(currentFen, san);
    const child: OpeningTreeNode = {
      san,
      fen: newFen,
      children: [],
      isMainLine: true,
    };
    currentNode.children.push(child);
    currentNode = child;
    currentFen = newFen;
  }

  // Add variations
  if (opening.variations) {
    for (const variation of opening.variations) {
      addVariationToTree(root, variation);
    }
  }

  return root;
}

function parseMoves(pgn: string): string[] {
  // Remove move numbers and extract just the moves
  return pgn
    .replace(/\d+\.\s*/g, '')
    .split(/\s+/)
    .filter(m => m.length > 0);
}

function addVariationToTree(root: OpeningTreeNode, variation: OpeningVariation): void {
  const moves = parseMoves(variation.moves);
  let currentNode = root;

  for (let i = 0; i < moves.length; i++) {
    const san = moves[i];
    
    // Find or create child node
    let child = currentNode.children.find(c => c.san === san);
    
    if (!child) {
      const newFen = applyMoveToFen(currentNode.fen, san);
      child = {
        san,
        fen: newFen,
        children: [],
        isMainLine: false,
        comment: i === moves.length - 1 ? variation.description : undefined,
      };
      currentNode.children.push(child);
    }
    
    currentNode = child;
  }
}

// Simple FEN manipulation (in production, use chess.js)
function applyMoveToFen(fen: string, san: string): string {
  // This is a simplified version - in production, use chess.js
  // For now, we'll store pre-computed FENs in the opening data
  return fen; // Placeholder
}

export function getOpeningById(id: string): OpeningLine | undefined {
  return OPENING_LIBRARY.find(o => o.id === id);
}

export function searchOpenings(query: string): OpeningLine[] {
  const lowerQuery = query.toLowerCase();
  return OPENING_LIBRARY.filter(o => 
    o.name.toLowerCase().includes(lowerQuery) ||
    o.eco.toLowerCase().includes(lowerQuery) ||
    o.themes?.some(t => t.toLowerCase().includes(lowerQuery))
  );
}

export function getOpeningsByTheme(theme: string): OpeningLine[] {
  return OPENING_LIBRARY.filter(o => o.themes?.includes(theme.toLowerCase()));
}

