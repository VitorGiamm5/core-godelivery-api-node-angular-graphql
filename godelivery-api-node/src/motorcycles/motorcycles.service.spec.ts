import { describe, it, expect } from 'vitest';
import { normalizePlate, validPlate } from './motorcycles.service.js';

describe('motorcycle plates', () => {
  it('normalizes the old plate format', () => {
    expect(normalizePlate('abc-1234')).toBe('ABC1234');
    expect(validPlate('abc-1234')).toBe(true);
  });
  it('accepts the Mercosul format', () => { expect(validPlate('ABC1D23')).toBe(true); });
  it('rejects a malformed plate', () => { expect(validPlate('123-ABCD')).toBe(false); });
});
