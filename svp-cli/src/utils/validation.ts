/**
 * Input validation utilities
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate UUID format
 * Security: Prevents path traversal and injection attacks
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}
