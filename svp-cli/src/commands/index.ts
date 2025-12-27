/**
 * Command router
 */

import type { ParsedArgs } from '../cli.js';
import { clone } from './clone.js';
import { stats } from './stats.js';
import { profiles } from './profiles.js';
import { recommend } from './recommend.js';

export interface CommandResult {
  success: boolean;
  [key: string]: unknown;
}

const commands: Record<string, (args: ParsedArgs) => Promise<CommandResult>> = {
  clone,
  stats,
  profiles,
  recommend,
  // report and config coming later
};

export async function runCommand(args: ParsedArgs): Promise<CommandResult> {
  const command = args.command;

  if (!command) {
    throw new Error('No command specified');
  }

  const handler = commands[command];

  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }

  return handler(args);
}
