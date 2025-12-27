/**
 * Hand-rolled CLI argument parser
 * Zero dependencies, ~80 lines
 */

export interface ParsedArgs {
  command?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
  // Common flags
  help: boolean;
  version: boolean;
  json: boolean;
  quiet: boolean;
  profile?: string;
}

/**
 * Parse command-line arguments
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    positional: [],
    flags: {},
    help: false,
    version: false,
    json: false,
    quiet: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--version' || arg === '-v') {
      result.version = true;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--quiet' || arg === '-q') {
      result.quiet = true;
    } else if (arg.startsWith('--')) {
      // Long flag: --name=value or --name value or --flag
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        const name = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        result.flags[name] = value;
        if (name === 'profile') result.profile = value;
      } else {
        const name = arg.slice(2);
        // Check if next arg is value (doesn't start with -)
        if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          result.flags[name] = argv[i + 1];
          if (name === 'profile') result.profile = argv[i + 1];
          i++;
        } else {
          result.flags[name] = true;
        }
      }
    } else if (arg.startsWith('-')) {
      // Short flags: -f value or -f
      const name = arg.slice(1);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        result.flags[name] = argv[i + 1];
        i++;
      } else {
        result.flags[name] = true;
      }
    } else {
      // Positional argument
      if (!result.command) {
        result.command = arg;
      } else {
        result.positional.push(arg);
      }
    }
    i++;
  }

  return result;
}

/**
 * Show help text
 */
export function showHelp(command?: string): void {
  if (command) {
    showCommandHelp(command);
    return;
  }

  console.log(`
SVP CLI - Session & Vibe Protocol

Usage: svp <command> [options]

Commands:
  clone <session-id>    Clone and trim a session
  stats <session-id>    Quick session statistics
  recommend <session-id> Analyze and recommend action
  report <session-id>   Generate session report
  profiles              List available profiles
  config                Show effective configuration

Options:
  -h, --help            Show help
  -v, --version         Show version
  --json                Output as JSON
  -q, --quiet           Minimal output

Examples:
  svp clone abc123 --profile=heavy-trim
  svp stats abc123
  svp stats abc123 --json
  svp profiles
`);
}

function showCommandHelp(command: string): void {
  const helpText: Record<string, string> = {
    clone: `
Usage: svp clone <session-id> [options]

Clone a Claude Code session with optional trimming.

Options:
  --profile=<name>      Use a named profile (quick-clean, heavy-trim, etc.)
  --tool-removal=<n>    Remove n% of tool calls from oldest turns (0-100)
  --tool-mode=<mode>    'remove' or 'truncate' (default: remove)
  --thinking-removal=<n> Remove n% of thinking blocks (0-100)
  --json                Output as JSON

Examples:
  svp clone abc123 --profile=heavy-trim
  svp clone abc123 --tool-removal=100 --thinking-removal=100
`,
    stats: `
Usage: svp stats <session-id> [options]

Show quick statistics for a session.

Options:
  --json                Output as JSON

Examples:
  svp stats abc123
  svp stats abc123 --json
`,
    report: `
Usage: svp report <session-id> [options]

Generate a readable session report.

Options:
  --format=<fmt>        Output format: md (default) or json
  --json                Same as --format=json

Examples:
  svp report abc123
  svp report abc123 --format=md > report.md
`,
    profiles: `
Usage: svp profiles [name]

List available profiles or show details of a specific profile.

Examples:
  svp profiles
  svp profiles heavy-trim
`,
    config: `
Usage: svp config

Show effective configuration.

Examples:
  svp config
  svp config --json
`,
    recommend: `
Usage: svp recommend <session-id>

Analyze a session and recommend an action.

Recommendations:
  CLONE     - Context is high, clone with suggested profile
  CONTINUE  - Context is healthy, no action needed
  START-FRESH - Session is minimal, consider starting over

Profiles (by context level):
  emergency - >85% context, remove all tool calls
  routine   - >70% context, truncate tool calls
  preserve  - >50% context, light cleanup
  minimal   - Low priority, just thinking blocks

Examples:
  svp recommend abc123
  svp recommend abc123 --json
`,
  };

  console.log(helpText[command] || `Unknown command: ${command}\n\nRun 'svp --help' for usage.`);
}

/**
 * Show version
 */
export function showVersion(): void {
  // Read from package.json in production, hardcode for now
  console.log('svp 0.1.0');
}
