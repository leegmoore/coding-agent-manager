/**
 * Validates UUID format (v4 style)
 * @param {string} id - String to validate
 * @returns {boolean} True if valid UUID format
 */
export function validateUUID(id) {
  if (typeof id !== 'string') return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(id);
}
