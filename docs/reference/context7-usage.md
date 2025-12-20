# Context7 API Usage Guide

## Overview

Context7 is a documentation retrieval service by Upstash that provides up-to-date library documentation via REST API. This replaces the need for an MCP server installation.

## Setup

### Prerequisites

1. Get an API key from [context7.com/dashboard](https://context7.com/dashboard)
2. Add to your shell config (`.zshrc`):
   ```bash
   export CONTEXT7_API_KEY=ctx7sk-your-key-here
   ```

### Available Scripts

```bash
npm run c7:search <query>              # Find library IDs
npm run c7:docs <owner/repo> [topic]   # Get code examples
npm run c7:info <owner/repo> [topic]   # Get conceptual/migration docs
```

## Usage Examples

### Find a Library ID

```bash
npm run c7:search express
```

Output:
```json
{
  "id": "/expressjs/express",
  "title": "Express",
  "description": "Fast, unopinionated, minimalist web framework for node."
}
```

### Get Code Documentation

```bash
npm run c7:docs expressjs/express routing
```

### Get Conceptual Documentation

```bash
npm run c7:info expressjs/express migration
```

## API Reference

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v2/search?query=<name>` | Search for libraries |
| `GET /api/v2/docs/code/<owner>/<repo>` | Code examples and API docs |
| `GET /api/v2/docs/info/<owner>/<repo>` | Conceptual guides and migration docs |

### Query Parameters

| Parameter | Description |
|-----------|-------------|
| `topic` | Focus on specific topic (e.g., "routing", "hooks") |
| `page` | Pagination (1-10) |
| `limit` | Results per page (1-100) |

### Authentication

All requests require Bearer token:
```
Authorization: Bearer $CONTEXT7_API_KEY
```

## Common Library IDs

| Library | ID |
|---------|-----|
| Express | `/expressjs/express` |
| React | `/facebook/react` |
| Next.js | `/vercel/next.js` |
| Zod | `/colinhacks/zod` |
| TypeScript | `/microsoft/typescript` |
| Tailwind CSS | `/websites/tailwindcss` |
| Vitest | `/websites/vitest_dev` |
| Node.js | `/nodejs/node` |

## Tips

### Use Single-Word Topics

Topics with spaces may fail. Use:
- `routing` not `express routing`
- `migration` not `breaking changes`
- `hooks` not `react hooks`

### Choose the Right Mode

- **`c7:docs`** (code mode): API references, code snippets, function signatures
- **`c7:info`** (info mode): Migration guides, conceptual overviews, architecture

### Pipe to Tools

```bash
# Preview first 50 lines
npm run c7:docs vercel/next.js routing | head -50

# Save to file for reference
npm run c7:docs vercel/next.js routing > next-routing-docs.md

# Search within results
npm run c7:docs expressjs/express | grep -A5 "middleware"
```

## Limitations

1. **Topic matching is fuzzy** - May return loosely related results
2. **Not all libraries indexed** - Smaller packages may not be available
3. **No version pinning in scripts** - Use URL directly for specific versions:
   ```bash
   curl -s "https://context7.com/api/v2/docs/code/vercel/next.js/v15.1.0" \
     -H "Authorization: Bearer $CONTEXT7_API_KEY"
   ```

## Why Not the SDK?

For simple documentation fetches, the SDK (`@upstash/context7-sdk`) adds unnecessary overhead:
- Extra dependency to maintain
- Same 4-line curl under the hood
- No benefit for low-volume usage (~100 calls/month)

The SDK is useful when:
- Building a product with thousands of API calls
- Need TypeScript types in your codebase
- Want automatic retry/error handling
