import { describe, it, expect } from 'vitest';
import { validCnpj } from './deliveriers.service.js';

describe('CNPJ validation', () => {
  it('accepts a valid formatted CNPJ', () => { expect(validCnpj('03.456.607/0001-79')).toBe(true); });
  it('rejects an invalid check digit', () => { expect(validCnpj('03.456.607/0001-78')).toBe(false); });
  it('rejects repeated digits', () => { expect(validCnpj('11.111.111/1111-11')).toBe(false); });
});
