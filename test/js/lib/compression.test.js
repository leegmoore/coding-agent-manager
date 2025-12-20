import { describe, it, expect } from 'vitest';
import { validateBands, buildCompressionBands, formatBandPreview } from '../../../public/js/lib/compression.js';

describe('validateBands', () => {
  it('returns valid for both empty', () => {
    const result = validateBands('', '');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns error for Band 1 only', () => {
    const result = validateBands('50', '');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Both bands required or both empty');
  });

  it('returns error for Band 2 only', () => {
    const result = validateBands('', '50');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Both bands required or both empty');
  });

  it('returns valid for both set correctly', () => {
    const result = validateBands('35', '75');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns error for Band 1 = 0', () => {
    const result = validateBands('0', '50');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 1 must be between 1 and 99');
  });

  it('returns error for Band 1 >= 100', () => {
    const result = validateBands('100', '100');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 1 must be between 1 and 99');
  });

  it('returns error for Band 2 <= Band 1', () => {
    const result = validateBands('60', '40');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 2 must be greater than Band 1');
  });

  it('returns error for Band 2 > 100', () => {
    const result = validateBands('50', '101');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 2 must be 100 or less');
  });

  it('returns error for non-integer Band 1', () => {
    const result = validateBands('35.5', '75');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 1 must be a whole number');
  });

  it('returns error for non-integer Band 2', () => {
    const result = validateBands('35', '75.5');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 2 must be a whole number');
  });

  it('returns multiple errors when applicable', () => {
    const result = validateBands('0', '101');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('buildCompressionBands', () => {
  it('returns undefined for empty inputs', () => {
    expect(buildCompressionBands('', '')).toBeUndefined();
  });

  it('builds correct bands array', () => {
    const bands = buildCompressionBands('35', '75');
    expect(bands).toEqual([
      { start: 0, end: 35, level: 'heavy-compress' },
      { start: 35, end: 75, level: 'compress' },
    ]);
  });

  it('handles Band 2 = 100', () => {
    const bands = buildCompressionBands('50', '100');
    expect(bands).toEqual([
      { start: 0, end: 50, level: 'heavy-compress' },
      { start: 50, end: 100, level: 'compress' },
    ]);
  });
});

describe('formatBandPreview', () => {
  it('returns empty message for no bands', () => {
    expect(formatBandPreview('', '')).toBe('No compression');
  });

  it('formats preview with uncompressed remainder', () => {
    expect(formatBandPreview('35', '75')).toBe('0-35% heavy | 35-75% compress | 75-100% none');
  });

  it('formats preview with full compression', () => {
    expect(formatBandPreview('50', '100')).toBe('0-50% heavy | 50-100% compress');
  });
});
