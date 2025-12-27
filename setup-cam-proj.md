# Coding Agent Manager - Project Setup

Give this to a Claude agent in any project to set up access to the context cleaning tool.

---

## Setup Instructions

Add the following to this project to enable quick context cleaning via the Coding Agent Manager service running on port 4010.

### 1. Add to package.json

**For npm:**
```json
{
  "scripts": {
    "quick-clean": "curl -s -X POST http://localhost:4010/api/v2/clone -H 'Content-Type: application/json' -d '{\"sessionId\":\"'$npm_config_id'\",\"toolRemoval\":\"100\",\"thinkingRemoval\":\"100\"}' | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8')); if(d.success){const id=d.outputPath.split('/').pop().replace('.jsonl',''); console.log('claude --dangerously-skip-permissions --resume '+id)}else{console.log('Error: '+(d.error||'unknown'))}\""
  }
}
```

**For bun:**
```json
{
  "scripts": {
    "quick-clean": "curl -s -X POST http://localhost:4010/api/v2/clone -H 'Content-Type: application/json' -d '{\"sessionId\":\"'\"$1\"'\",\"toolRemoval\":\"100\",\"thinkingRemoval\":\"100\"}' | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8')); if(d.success){const id=d.outputPath.split('/').pop().replace('.jsonl',''); console.log('claude --dangerously-skip-permissions --resume '+id)}else{console.log('Error: '+(d.error||'unknown'))}\""
  }
}
```

### 2. Add to CLAUDE.md

Add this section to the project's CLAUDE.md (create if it doesn't exist):

```markdown
## Context Cleaning

When the user provides a session GUID and asks to reduce context, clean the session, or remove tool calls:

**npm:**
```bash
npm run quick-clean --id=<session-guid>
```

**bun:**
```bash
bun run quick-clean <session-guid>
```

This clones the session with all tool calls and thinking blocks removed. Returns a command like:
```
claude --dangerously-skip-permissions --resume <new-session-id>
```

Show this command to the user. They must exit the current session and run that command to continue with reduced context.
```

---

## Usage

Once set up, when a user says something like:
- "clean my context"
- "reduce context, session ID is abc123..."
- "remove tool calls from xyz789..."

Run the quick-clean script with their session ID and show them the resume command.

---

## Troubleshooting

**"Connection refused"** - The Coding Agent Manager service isn't running.

**"Session not found"** - Check the session GUID is correct.

**Service location:** The CAM service should be running on `http://localhost:4010`. Verify with:
```bash
curl http://localhost:4010/health
```
