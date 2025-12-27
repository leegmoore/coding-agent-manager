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
 *
 * Named for agent decision-making:
 * - emergency: Critical context (>85%), remove everything
 * - routine: Regular maintenance (>70%), truncate for some context
 * - preserve: Keep recent work visible, lighter touch
 * - minimal: Just thinking blocks, preserve tool history
 */
const BUILT_IN_PROFILES: Record<string, CloneProfile> = {
  'emergency': {
    toolRemoval: 100,
    toolHandlingMode: 'remove',
    thinkingRemoval: 100,
  },
  'routine': {
    toolRemoval: 100,
    toolHandlingMode: 'truncate',
    thinkingRemoval: 100,
  },
  'preserve': {
    toolRemoval: 80,
    toolHandlingMode: 'truncate',
    thinkingRemoval: 100,
  },
  'minimal': {
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
