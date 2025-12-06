/**
 * Validates compression band inputs
 * @param {string} band1 - Band 1 end percentage (or empty)
 * @param {string} band2 - Band 2 end percentage (or empty)
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateBands(band1, band2) {
  const errors = [];
  const b1 = band1.trim();
  const b2 = band2.trim();

  // Both empty is valid
  if (b1 === '' && b2 === '') {
    return { valid: true, errors: [] };
  }

  // One set, one empty is invalid
  if ((b1 === '' && b2 !== '') || (b1 !== '' && b2 === '')) {
    errors.push('Both bands required or both empty');
    return { valid: false, errors };
  }

  const num1 = Number(b1);
  const num2 = Number(b2);

  // Check integers
  if (!Number.isInteger(num1)) {
    errors.push('Band 1 must be a whole number');
  }
  if (!Number.isInteger(num2)) {
    errors.push('Band 2 must be a whole number');
  }

  // Check Band 1 range
  if (Number.isInteger(num1) && (num1 < 1 || num1 >= 100)) {
    errors.push('Band 1 must be between 1 and 99');
  }

  // Check Band 2 > Band 1
  if (Number.isInteger(num1) && Number.isInteger(num2) && num2 <= num1) {
    errors.push('Band 2 must be greater than Band 1');
  }

  // Check Band 2 <= 100
  if (Number.isInteger(num2) && num2 > 100) {
    errors.push('Band 2 must be 100 or less');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Builds compression bands array for API
 * @param {string} band1 - Band 1 end percentage
 * @param {string} band2 - Band 2 end percentage
 * @returns {Array|null} Bands array or null if no compression
 */
export function buildCompressionBands(band1, band2) {
  const b1 = band1.trim();
  const b2 = band2.trim();

  if (b1 === '' && b2 === '') {
    return null;
  }

  return [
    { start: 0, end: Number(b1), level: 'heavy-compress' },
    { start: Number(b1), end: Number(b2), level: 'compress' },
  ];
}

/**
 * Formats band preview text
 * @param {string} band1 - Band 1 end percentage
 * @param {string} band2 - Band 2 end percentage
 * @returns {string} Human-readable preview
 */
export function formatBandPreview(band1, band2) {
  const b1 = band1.trim();
  const b2 = band2.trim();

  if (b1 === '' && b2 === '') {
    return 'No compression';
  }

  const num1 = Number(b1);
  const num2 = Number(b2);

  let preview = `0-${num1}% heavy | ${num1}-${num2}% compress`;
  if (num2 < 100) {
    preview += ` | ${num2}-100% none`;
  }

  return preview;
}
