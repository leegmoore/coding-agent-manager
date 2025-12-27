#!/usr/bin/env node

/**
 * SVP CLI - Session & Vibe Protocol
 * Command-line toolkit for AI agents
 */

import { parseArgs, showHelp, showVersion } from './cli.js';
import { runCommand } from './commands/index.js';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp(args.command);
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  if (!args.command) {
    showHelp();
    process.exit(0);
  }

  try {
    const result = await runCommand(args);

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Human-readable output handled by command
    }

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (args.json) {
      console.error(JSON.stringify({ error: message }));
    } else {
      console.error(`Error: ${message}`);
    }

    process.exit(1);
  }
}

main();
