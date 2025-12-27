# Coding Agent Manager

A utility for managing Claude Code and GitHub Copilot session files. Provides tools for cloning sessions with tool call/thinking removal, message compression, and session visualization.

## Directory Structure

```
src/
├── server.ts              # Express entry point
├── config.ts              # Environment configuration (port 4010)
├── types.ts               # TypeScript interfaces
├── errors.ts              # Custom error classes
├── lib/                   # Core utilities
├── providers/             # LLM provider abstraction
├── routes/                # API endpoints
├── schemas/               # Zod validation
├── services/              # Business logic
└── sources/               # Session source abstraction (Claude/Copilot)

public/js/
├── lib/                   # Pure functions (testable without DOM)
├── api/                   # Fetch wrapper
├── ui/                    # Loading states, notifications
└── pages/                 # Page orchestration

views/pages/               # EJS templates
```

## Key Documentation

- [Session Format Spec](docs/reference/claude-code-session-storage-formats.md) - Claude Code session structure
- [Copilot Format Spec](docs/reference/github-copilot-session-storage-formats.md) - GitHub Copilot session structure
- [Product Brief](docs/PRODUCT-BRIEF.md) - Product overview
- [Technical Design](docs/TECHNICAL-DESIGN.md) - Architecture details

## Running the Service

The service runs on **port 4010** by default.

```bash
npm run dev
```

## Web UI

Access the web interface at `http://localhost:4010`:
- **Session Browser** (`/`) - Browse and manage sessions
- **Clone** (`/session-clone`) - Clone with removal/compression options
- **Visualize** (`/session-detail`) - Turn-by-turn session visualization

## Quick Clean (Context Reduction)

When the user provides a session GUID and asks to reduce context or clean the session:

```bash
npm run quick-clean --id=<session-guid>
```

This clones the session with 100% tool removal and 100% thinking removal. Returns a command like:
```
claude --dangerously-skip-permissions --resume <new-session-id>
```

Show this command to the user. They must exit the current session and run that command to continue with the cleaned context.

## Web UI Cloning

For more control (custom removal percentages, compression):

1. Open the Session Browser at `http://localhost:4010`
2. Select a project and find the session
3. Click **Clone**
4. Configure removal options
5. Clone creates a new session file
6. Exit and resume the cloned session

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v2/clone` | POST | Clone with compression options |
| `/api/projects` | GET | List Claude projects |
| `/api/copilot/projects` | GET | List Copilot workspaces |
