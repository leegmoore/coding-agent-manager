/**
 * svp profiles command
 */

import type { ParsedArgs } from '../cli.js';
import type { CommandResult } from './index.js';
import { getBuiltInProfiles, type CloneProfile } from '../config/profiles.js';

export async function profiles(args: ParsedArgs): Promise<CommandResult> {
  const profileName = args.positional[0];
  const allProfiles = getBuiltInProfiles();

  if (profileName) {
    // Show specific profile
    const profile = allProfiles[profileName];

    if (!profile) {
      throw new Error(`Unknown profile: ${profileName}\n\nRun 'svp profiles' to list available profiles.`);
    }

    if (!args.json && !args.quiet) {
      console.log(`
Profile: ${profileName}

  toolRemoval:        ${profile.toolRemoval}%
  toolHandlingMode:   ${profile.toolHandlingMode}
  thinkingRemoval:    ${profile.thinkingRemoval}%
`);
    }

    return {
      success: true,
      name: profileName,
      profile,
    };
  }

  // List all profiles
  if (!args.json && !args.quiet) {
    console.log('\nAvailable profiles:\n');
    for (const [name, profile] of Object.entries(allProfiles)) {
      console.log(`  ${name.padEnd(20)} tool:${profile.toolRemoval}% thinking:${profile.thinkingRemoval}%`);
    }
    console.log('\nRun \'svp profiles <name>\' for details.');
  }

  return {
    success: true,
    profiles: allProfiles,
  };
}
