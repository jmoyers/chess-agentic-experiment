# Lichess Opening Explorer Library

A TypeScript library for exploring chess openings using the [Lichess Opening Explorer API](https://lichess.org/api#tag/Opening-Explorer).

## Quick Start

```typescript
import { OpeningExplorer, STARTING_FEN } from './database/lichess';

const explorer = new OpeningExplorer();

// Query the Masters database (OTB titled player games)
const result = await explorer.masters(STARTING_FEN);
console.log(result.stats); // { totalGames: 1248875, whiteWinPercent: 32.9, ... }
console.log(result.moves[0]); // Most popular move: e4
```

## Databases

### Masters Database
Over-the-board games by titled players since 1952. High-quality games, smaller dataset.

```typescript
const result = await explorer.masters(fen, {
  since: 2000,  // Only games from 2000+
  until: 2024,
  moves: 12,    // Max moves to return
  topGames: 15, // Max sample games
});
```

### Lichess Database
Hundreds of millions of online games. Filter by rating and time control.

```typescript
const result = await explorer.lichess(fen, {
  speeds: ['rapid', 'classical'],
  ratings: [2000, 2200, 2500],
  since: '2023-01',
  until: '2024-06',
});
```

### Player Database
Explore a specific player's repertoire.

```typescript
const result = await explorer.player(fen, {
  player: 'DrNykterstein', // Magnus Carlsen
  color: 'white',
  speeds: ['bullet', 'blitz'],
});
```

## Response Format

```typescript
interface ExplorerResult {
  database: 'masters' | 'lichess' | 'player';
  stats: {
    totalGames: number;
    whiteWinPercent: number;  // 0-100
    drawPercent: number;
    blackWinPercent: number;
  };
  moves: Array<{
    san: string;           // e.g., "e4"
    uci: string;           // e.g., "e2e4"
    totalGames: number;
    playRate: number;      // % of position games
    whiteWinPercent: number;
    drawPercent: number;
    blackWinPercent: number;
    averageRating: number;
    opening?: { eco: string; name: string };
  }>;
  opening?: { eco: string; name: string };
  raw: LichessExplorerResponse; // Original API response
}
```

## Caching

The library includes in-memory caching to reduce API calls:

```typescript
const explorer = new OpeningExplorer({
  cacheTtl: 5 * 60 * 1000,  // 5 minutes (default)
  maxCacheSize: 1000,       // Max entries
});

// Check cache stats
console.log(explorer.getCacheStats()); // { size: 42, maxSize: 1000 }

// Clear cache
explorer.clearCache();
```

## Default Filters

Pre-configured filter presets for common use cases:

```typescript
import { DEFAULT_FILTERS } from './database/lichess';

// Competitive games: rapid/classical, 2000+ rating
DEFAULT_FILTERS.competitive

// Fast games: bullet/blitz
DEFAULT_FILTERS.fast

// Elite games: 2500+ rating
DEFAULT_FILTERS.elite

// All games (no filter)
DEFAULT_FILTERS.all
```

## Database Downloads (Optional)

For offline analysis, you can download the raw Lichess databases:

```bash
# Show available databases
npx tsx src/database/lichess/download.ts --help

# Download evaluations (~1.5GB compressed)
npx tsx src/database/lichess/download.ts --evaluations

# Download puzzles (~200MB compressed)
npx tsx src/database/lichess/download.ts --puzzles

# Download games for a month (~10-30GB compressed)
npx tsx src/database/lichess/download.ts --games --year 2024 --month 01

# Check what's downloaded
npx tsx src/database/lichess/download.ts --check
```

**Note:** The Opening Explorer API doesn't require local downloads - it queries Lichess servers directly. Downloads are only needed for offline analysis or custom data processing.

## Rate Limits

The Lichess API has rate limits (~15 requests/minute per database). The library handles 429 errors but doesn't implement automatic retry/backoff. The caching helps reduce API calls.

## License

The Lichess database is released under [CC0 (public domain)](https://database.lichess.org/).

