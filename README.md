# Coding Agent Manager

A web application for managing, analyzing, and transforming Claude Code and GitHub Copilot sessions.

## What It Does

- **Clone Sessions** - Create copies with selective removal of tool calls and thinking blocks
- **Compress Messages** - LLM-based compression to reduce context window usage
- **Visualize Context** - See where tokens are being consumed
- **Browse Sessions** - Navigate Claude and Copilot sessions across projects

## Why

Claude Code sessions accumulate context over time, eventually hitting limits or degrading performance. This tool lets you "slim down" sessions by:

- Removing old tool calls (50-100% from oldest portion)
- Removing thinking blocks (always 100%)
- Compressing older messages to 10-35% of original length

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Requirements

- Node.js 22+
- OpenRouter API key (for compression) - set `OPENROUTER_API_KEY` in `.env.local`

## Session Sources

| Source | Location |
|--------|----------|
| Claude Code | `~/.claude/projects/` |
| GitHub Copilot | VS Code workspace storage |

## Project Structure

```
src/
├── routes/          # API endpoints
├── services/        # Business logic
├── sources/         # Session source adapters
├── providers/       # LLM provider abstraction
└── lib/             # Utilities

public/js/           # Frontend (vanilla JS + Tailwind)
views/pages/         # EJS templates
```

## Development

```bash
npm test             # Run tests
npm run typecheck    # Type check
npm run dev          # Dev server with hot reload
```

## License

MIT
