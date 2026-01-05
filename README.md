# Chess Opening Study

An experimental agentic application exploring frontier model capabilities at the intersection of chess and AI. Rather than playing chess, the agent helps you understand openings, themes, attacking plans, and positional concepts through an interactive coaching interface.

[![Demo Video](https://cdn.loom.com/sessions/thumbnails/97f53213d8dd4292b18eb45a7f780783-4eb69ea8dd3ed54a-full-play.gif)](https://www.loom.com/share/97f53213d8dd4292b18eb45a7f780783)

> **[Watch the full demo →](https://www.loom.com/share/97f53213d8dd4292b18eb45a7f780783)**

![Screenshot](docs/screenshot.png)

## What is this?

This project builds an agent harness with access to the same tools a chess player uses when studying: **Stockfish** for deep analysis, the **Masters database** (2.7M over-the-board games), **Lichess API** (80M online games), and a **local explorer** with indexed games for instant queries.

The goal isn't to replace grandmaster instruction - it's to explore whether an AI with proper tooling can fill the gap between high-level teaching content and a learner who needs 20 more questions answered to truly understand a position.

### Key observations

- **Recent reasoning models have crossed a threshold.** A year ago, LLMs couldn't beat random moves. Now models like Gemini 3 Pro exceed the average chess.com player (~650 ELO).
- **Tool access matters more than raw chess ability.** The agent doesn't need to calculate—it can query Stockfish. It needs to _explain_ with access to statistics and examples.
- **Real-time shared state is essential for agentic UIs.** The agent manipulates the board, draws arrows, highlights squares. Socket.IO provides the transport for this canvas collaboration.

## Features

- **Multi-provider AI support**: Claude Opus 4.5, Gemini 3 Pro, ChatGPT-5.2 with unified interface
- **25+ agent tools**: Board manipulation, visual annotations, database queries, Stockfish analysis, teaching aids
- **Opening Explorer**: Query Masters DB, Lichess, or local indexed games
- **Streaming analysis**: Watch Stockfish think in real-time (depth 20+)
- **Deep linking**: Share specific positions and conversations via URL

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (React + Vite)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Board Component     │  Interactive chessboard with drag-drop, annotations  │
│  AgentDrawer         │  AI chat with streaming, tool indicators, Q&A        │
│  Side Panels         │  OpeningSelector, MoveTree, AnalysisPanel            │
│  Zustand Stores      │  Connection, Board, Conversation, Explorer, Analysis │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                           Socket.IO (WebSocket)
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVER (Node.js + Express)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ChessManager        │  chess.js wrapper for move validation, FEN/PGN       │
│  AgentHarness        │  Agentic loop: planning → tool calls → streaming     │
│  AI Providers        │  Anthropic, OpenAI, Google with extended thinking    │
│  Tools (25+)         │  Board, visual, database, engine, teaching           │
│  Database Layer      │  Lichess API, local LMDB explorer, opening library   │
│  Stockfish Engine    │  UCI protocol, streaming multi-PV analysis           │
└─────────────────────────────────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design.

## Getting Started

### Prerequisites

- Node.js 20+
- Stockfish binary (or run `server/scripts/build-stockfish.sh`)

### Environment Variables

```bash
# At least one AI provider required
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=AIza...

# Optional
AI_PROVIDER=anthropic  # or openai, google
STOCKFISH_PATH=/path/to/stockfish
```

### Installation

```bash
npm install
cd client && npm install
cd ../server && npm install
cd ../shared && npm install
```

### Running

```bash
# Terminal 1: Server
cd server && npm run dev

# Terminal 2: Client
cd client && npm run dev
```

Open http://localhost:5173

## Development

### Testing

```bash
# Unit tests
cd server && npm test
cd client && npm test

# E2E tests (requires running app)
cd client && npx playwright test
```

### Project Structure

```
client/           # React frontend
  e2e/            # Playwright E2E tests
  src/
    components/   # UI components
    stores/       # Zustand state management
server/           # Node.js backend
  src/
    agent/        # AI harness and providers
    chess/        # Game state management
    database/     # Lichess, local explorer, openings
    engine/       # Stockfish integration
shared/           # TypeScript types for client/server
```

## Acknowledgments & Licenses

### Chess Engine

| Project                                  | License   | Description                                                                                                                                  |
| ---------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [Stockfish](https://stockfishchess.org/) | **GPLv3** | Open-source chess engine. This project communicates with Stockfish via UCI protocol but does not modify or distribute Stockfish source code. |

### Libraries

| Project                                        | License                     | Description                                                   |
| ---------------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| [chess.js](https://github.com/jhlywa/chess.js) | **BSD-2-Clause**            | JavaScript chess library for move validation, FEN/PGN parsing |
| [LMDB](https://github.com/LMDB/lmdb-js)        | **OpenLDAP Public License** | Lightning Memory-Mapped Database for local position indexing  |

### Data Sources

| Source                                                                       | License                     | Description                                                                 |
| ---------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| [Lichess Game Database](https://database.lichess.org/)                       | **CC0 1.0 (Public Domain)** | Monthly exports of all rated games played on Lichess                        |
| [Lichess Opening Explorer API](https://lichess.org/api#tag/Opening-Explorer) | **AGPL-3.0** (API code)     | REST API for querying opening statistics from Masters and Lichess databases |
| [Lichess Opening Names](https://github.com/lichess-org/chess-openings)       | **Public Domain**           | ECO codes and opening name mappings                                         |

### Research & Benchmarks

| Project                                                                           | Notes                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Maxim Saplin's LLM Chess Leaderboard](https://maxim-saplin.github.io/llm_chess/) | ELO benchmarking methodology for evaluating LLM chess capabilities |

### AI Provider APIs

This project uses official API clients for AI providers. Usage is governed by each provider's Terms of Service:

- [Anthropic API Terms](https://www.anthropic.com/legal/consumer-terms)
- [OpenAI API Terms](https://openai.com/policies/terms-of-use)
- [Google AI Terms](https://ai.google.dev/gemini-api/terms)

## License

MIT

---

_Note: Lichess game data is released under CC0, meaning no attribution is required, but we gratefully acknowledge their contribution to open chess data. Stockfish is GPLv3, but this project only communicates with it as an external binary via UCI protocol and does not link against or distribute Stockfish code._
