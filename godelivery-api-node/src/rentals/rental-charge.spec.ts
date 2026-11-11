import { describe, it, expect } from 'vitest';
import { calculateReturn } from './rental-charge.js';

describe('rental return charge', () => {
  const expected = new Date('2026-11-17T00:00:00.000Z');

  it('charges the planned days and no penalty on the expected date', () => {
    const result = calculateReturn(expected, expected, 7, 100);
    expect(result).toEqual({ message: 'return to base date accepted with success', value: 0, chargeableDays: 7, rentalAmount: 700, totalCharge: 700 });
  });

  it('charges one full late penalty for a fraction of a day', () => {
    const result = calculateReturn(new Date('2026-11-17T12:00:00.000Z'), expected, 7, 100);
    expect(result.value).toBe(50);
    expect(result.totalCharge).toBe(750);
  });

  it('uses the 20 percent early fee for a seven day plan', () => {
    const result = calculateReturn(new Date('2026-11-16T00:00:00.000Z'), expected, 7, 100);
    expect(result.value).toBe(20);
    expect(result.chargeableDays).toBe(6);
    expect(result.totalCharge).toBe(620);
  });

  it('uses the 40 percent early fee for longer plans', () => {
    const result = calculateReturn(new Date('2026-11-15T00:00:00.000Z'), expected, 15, 100);
    expect(result.value).toBe(80);
    expect(result.chargeableDays).toBe(13);
  });
});
