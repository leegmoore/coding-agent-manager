# Coding Agent Manager - Project Setup

Give this prompt to a Claude agent in any project to set up access to the Coding Agent Manager tool.

---

## Prompt for Claude

Copy and paste this to your Claude agent:

---

**Set up access to the Coding Agent Manager service.**

The Coding Agent Manager runs on `http://localhost:7331` and provides a tool to strip tool calls and thinking blocks from Claude Code sessions.

### 1. Add to package.json

Add this script to the project's `package.json`:

**For npm:**
```json
{
  "scripts": {
    "strip": "curl -s -X POST http://localhost:7331/api/session/$npm_config_id/strip | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.success ? 'Stripped '+d.toolCallsRemoved+' tools, '+d.thinkingBlocksRemoved+' thinking. Backup: '+d.backupPath : 'Error: '+d.error)\""
  }
}
```

**For bun (in package.json):**
```json
{
  "scripts": {
    "strip": "curl -s -X POST http://localhost:7331/api/session/$1/strip | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.success ? 'Stripped '+d.toolCallsRemoved+' tools, '+d.thinkingBlocksRemoved+' thinking. Backup: '+d.backupPath : 'Error: '+d.error)\""
  }
}
```

### 2. Add to CLAUDE.md

Add this section to the project's `CLAUDE.md` (create if it doesn't exist):

```markdown
## Session Management

### Strip Tool Calls

When the user provides a session GUID and asks to strip tool calls from the session:

**npm:**
```bash
npm run strip --id=<session-guid>
```

**bun:**
```bash
bun run strip <session-guid>
```

This removes all tool calls and thinking blocks from the session, creating a backup first. Use this to reduce context size in long sessions.
```

---

## Manual Setup Reference

If you're setting this up manually instead of via Claude:

### Step 1: Verify the service is running

```bash
curl http://localhost:7331/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Step 2: Add the script

Edit `package.json` and add the strip script (see above for npm vs bun versions).

### Step 3: Update CLAUDE.md

Add the session management section so agents know how to use it.

### Step 4: Test it

```bash
# Get your session ID from Claude Code status line, then:
npm run strip --id=your-session-guid-here
# or
bun run strip your-session-guid-here
```

---

## Troubleshooting

**"Connection refused"** - The Coding Agent Manager service isn't running. Start it:
```bash
cd /path/to/coding-agent-manager
npm run serve
```

**"Session not found"** - The session GUID doesn't exist. Check the ID is correct.

**"Error: Unknown error"** - Check the service logs:
```bash
cd /path/to/coding-agent-manager
npm run serve:logs
```
