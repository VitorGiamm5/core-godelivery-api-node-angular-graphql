import { describe, expect, it } from 'vitest';
import { trustedWebOrigins } from './web-origins.js';

describe('trustedWebOrigins', () => {
  it('allows localhost and its HTTP loopback alias', () => {
    expect(trustedWebOrigins('http://localhost:9100')).toEqual([
      'http://localhost:9100',
      'http://127.0.0.1:9100',
    ]);
  });

  it('keeps HTTPS production origins restricted to their configured host', () => {
    expect(trustedWebOrigins('https://delivery.example.com')).toEqual([
      'https://delivery.example.com',
    ]);
  });
});
