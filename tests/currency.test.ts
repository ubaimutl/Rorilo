import { describe, it, expect } from 'vitest';
import { formatCurrency, normalizeCurrencyCode } from '../lib/utils';

describe('Currency formatting', () => {
  it('normalizes symbols and garbage to ISO codes', () => {
    expect(normalizeCurrencyCode('EUR')).toBe('EUR');
    expect(normalizeCurrencyCode('eur')).toBe('EUR');
    expect(normalizeCurrencyCode('€')).toBe('EUR');
    expect(normalizeCurrencyCode('$')).toBe('USD');
    expect(normalizeCurrencyCode('£')).toBe('GBP');
    expect(normalizeCurrencyCode('')).toBe('USD');
    expect(normalizeCurrencyCode(undefined)).toBe('USD');
    expect(normalizeCurrencyCode('EURO')).toBe('USD');
  });

  it('never throws on scraped or hand-typed currency values', () => {
    for (const code of ['€', '$', '', 'EURO', 'EU', 'usd ', ' US DOLLAR ', '💶']) {
      expect(() => formatCurrency(80000, code)).not.toThrow();
    }
    expect(formatCurrency(80000, '€')).toContain('80');
    expect(formatCurrency(null, '€')).toBe('');
  });
});
