# Coding Agent Manager

A utility for managing Claude Code and GitHub Copilot session files. Provides tools for cloning sessions with tool call/thinking removal, message compression, and session visualization.

## Directory Structure

```
src/
├── server.ts              # Express entry point
├── config.ts              # Environment configuration (port 7331)
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

The service runs on **port 7331** by default.

### Development (with hot reload)
```bash
npm run dev
```

### Production (via pm2)
```bash
npm run build              # Compile TypeScript to dist/
npm run serve              # Start via pm2
npm run serve:stop         # Stop the service
npm run serve:restart      # Restart after rebuild
npm run serve:status       # Check if running
npm run serve:logs         # Tail logs
```

### macOS: Auto-start on boot
```bash
npm run serve              # Start the process first
pm2 save                   # Save current process list
pm2 startup                # Generates a command - run it with sudo
```

## Tools & Procedures

### Strip Tool Calls from a Session

When the user provides a session GUID and asks to strip tool calls:

```bash
npm run strip --id=<session-guid>
```

Example:
```bash
npm run strip --id=abc12345-1234-5678-9abc-def012345678
```

This will:
1. Create a backup of the session
2. Remove all tool calls (100%)
3. Remove all thinking blocks (100%)
4. Write changes in place

### Web UI

Access the web interface at `http://localhost:7331`:
- **Session Browser** (`/`) - Browse and manage sessions
- **Clone** (`/session-clone`) - Clone with removal/compression options
- **Visualize** (`/session-detail`) - Turn-by-turn session visualization

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/session/:id/strip` | POST | Strip tools and thinking from session |
| `/api/session/:id/backups` | GET | List backups for a session |
| `/api/v2/clone` | POST | Clone with compression options |
| `/api/projects` | GET | List Claude projects |
| `/api/copilot/projects` | GET | List Copilot workspaces |
