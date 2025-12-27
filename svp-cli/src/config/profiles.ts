/**
 * Clone profile definitions
 */

export interface CloneProfile {
  toolRemoval: number;
  toolHandlingMode: 'remove' | 'truncate';
  thinkingRemoval: number;
}

/**
 * Built-in profiles
 */
const BUILT_IN_PROFILES: Record<string, CloneProfile> = {
  'quick-clean': {
    toolRemoval: 100,
    toolHandlingMode: 'remove',
    thinkingRemoval: 100,
  },
  'heavy-trim': {
    toolRemoval: 100,
    toolHandlingMode: 'truncate',
    thinkingRemoval: 100,
  },
  'preserve-recent': {
    toolRemoval: 80,
    toolHandlingMode: 'remove',
    thinkingRemoval: 100,
  },
  'light-trim': {
    toolRemoval: 50,
    toolHandlingMode: 'truncate',
    thinkingRemoval: 100,
  },
};

export function getBuiltInProfiles(): Record<string, CloneProfile> {
  return { ...BUILT_IN_PROFILES };
}

export function getProfile(name: string): CloneProfile | undefined {
  return BUILT_IN_PROFILES[name];
}
