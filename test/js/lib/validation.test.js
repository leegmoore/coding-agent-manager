import { describe, it, expect } from 'vitest';
import { validateUUID } from '../../../public/js/lib/validation.js';

describe('validateUUID', () => {
  it('returns true for valid UUID v4 format', () => {
    expect(validateUUID('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4')).toBe(true);
  });

  it('returns true for uppercase UUID', () => {
    expect(validateUUID('00A61603-C2EA-4D4C-AEE8-4A292AB7B3F4')).toBe(true);
  });

  it('returns false for invalid format - missing segment', () => {
    expect(validateUUID('00a61603-c2ea-4d4c-aee8')).toBe(false);
  });

  it('returns false for invalid format - wrong characters', () => {
    expect(validateUUID('00a61603-c2ea-4d4c-aee8-4a292ab7b3fz')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateUUID('')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(validateUUID(null)).toBe(false);
    expect(validateUUID(undefined)).toBe(false);
    expect(validateUUID(123)).toBe(false);
  });

  it('returns false for string with extra characters', () => {
    expect(validateUUID('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4-extra')).toBe(false);
  });

  // Whitespace-padded UUIDs should fail - callers must trim before validating
  it('returns false for whitespace-padded UUID', () => {
    expect(validateUUID(' 00a61603-c2ea-4d4c-aee8-4a292ab7b3f4')).toBe(false);
    expect(validateUUID('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4 ')).toBe(false);
    expect(validateUUID(' 00a61603-c2ea-4d4c-aee8-4a292ab7b3f4 ')).toBe(false);
  });
});
