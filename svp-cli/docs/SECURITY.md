# SVP CLI - Security Documentation

## Overview

This document explains the security model of SVP CLI for enterprise security teams and auditors.

---

## What This Tool Does

SVP CLI is a command-line utility for managing Claude Code session files. It:

1. **Reads** session files from `~/.claude/projects/`
2. **Creates** new session files (clones) with reduced content
3. **Analyzes** session files to produce statistics and reports

It does **not**:
- Modify original session files
- Access network resources (v1)
- Store or transmit credentials
- Execute arbitrary code
- Require elevated privileges

---

## The `--dangerously-skip-permissions` Flag

### What It Is

When SVP CLI clones a session, the output includes a resume command:

```
claude --dangerously-skip-permissions --resume <session-id>
```

This is a **standard Claude CLI flag**, not custom code from this project.

### Why It's Used

The `--dangerously-skip-permissions` flag allows resuming a session without re-prompting for tool permissions. This is necessary because:

1. The cloned session references tool calls that were already approved
2. Without this flag, Claude would re-prompt for every tool permission
3. This is the documented way to resume sessions

### Enterprise Control

**Important:** If your organization uses Claude Code's managed settings, the `disableBypassPermissionsMode` setting can block this flag entirely. When enabled:

- The `--dangerously-skip-permissions` flag is rejected
- Users must re-approve all permissions
- This is the recommended setting for high-security environments

Reference: Claude Code managed settings documentation.

### Risk Assessment

| Risk | Mitigation |
|------|------------|
| Bypasses permission prompts | Only for pre-approved sessions; enterprise policy can disable |
| Could resume malicious session | Session must exist locally; user must have filesystem access |
| Social engineering vector | Flag name itself is a warning; documented behavior |

---

## Credential Handling

### Policy

**SVP CLI does not store credentials in configuration files.**

All API keys and secrets (if needed in future versions) must be provided via:
- Environment variables
- Platform credential stores (AWS credential chain, system keychain)

### Current State (v1)

v1 does not require any API keys. It only operates on local files.

### Future Versions

If v2 adds API integrations (search providers, model providers), credentials will be:
- Loaded from environment variables only
- Never written to disk by SVP CLI
- Never included in error messages or logs

---

## Session File Security

### Sensitivity

Claude Code session files may contain sensitive data:
- Code snippets and file contents
- API keys mentioned in conversation
- Internal URLs and infrastructure details
- Proprietary information discussed with Claude

### File Permissions

SVP CLI:
- Reads files with current user permissions
- Writes new files with mode `0600` (owner read/write only)
- Does not modify file ownership

### Recommendations

1. Ensure `~/.claude/` has appropriate permissions (`0700` recommended)
2. Do not share session IDs or files outside your organization
3. Review session contents before sharing reports externally

---

## Input Validation

### Session ID Validation

All session IDs are validated as UUIDs before use:

```typescript
/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

This prevents:
- Path traversal attacks (`../../../etc/passwd`)
- Command injection (if future versions shell out)
- Arbitrary file access

### Configuration Validation

Configuration files are parsed with strict JSON validation. Invalid configurations produce clear errors and abort execution.

---

## Dependencies

### Runtime Dependencies

v1 has minimal runtime dependencies:
- `commander` - CLI framework (well-maintained, widely used)

### Supply Chain

Recommendations for enterprise deployment:
1. Pin exact versions in package-lock.json
2. Run `npm audit` before deployment
3. Consider using a private npm registry
4. Review dependency licenses (MIT compatible)

---

## Network Access

### v1

SVP CLI v1 makes **no network requests**. All operations are local file I/O.

### Future Versions

If v2 adds network features:
- All endpoints will be documented
- No automatic phone-home or telemetry
- Network access will be explicit (user invokes search/model commands)

---

## Logging

### Current Behavior

SVP CLI outputs to:
- **stdout**: Command results (JSON or human-readable)
- **stderr**: Error messages

### Sensitive Data

Error messages never include:
- Full file contents
- API keys or credentials
- Stack traces with sensitive paths (in production mode)

---

## Audit Checklist

For security teams reviewing this tool:

- [ ] No hardcoded credentials in source code
- [ ] No network access in v1
- [ ] UUID validation on all session ID inputs
- [ ] Atomic file writes prevent corruption
- [ ] Restrictive file permissions (0600)
- [ ] Minimal dependencies (1 runtime dep)
- [ ] Clear documentation of `--dangerously-skip-permissions`
- [ ] No shell command string interpolation

---

## Reporting Security Issues

If you discover a security vulnerability:

1. Do not open a public GitHub issue
2. Email security concerns to the repository maintainer
3. Include steps to reproduce if applicable

---

*This document is intended for enterprise security teams evaluating SVP CLI for deployment.*
