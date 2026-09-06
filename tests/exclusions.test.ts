import { describe, it, expect } from 'vitest';
import { parseCompanyPattern, matchesExcludedCompany } from '../lib/jobs/exclusions';

describe('Company blocklist matching', () => {
  it('matches plain names case-insensitively by substring', () => {
    expect(matchesExcludedCompany('Example Staffing Partners Ltd', ['staffing partners'])).toBe(
      'staffing partners'
    );
    expect(matchesExcludedCompany('Example Grocery Inc', ['staffing partners'])).toBeNull();
  });

  it('supports /regex/flags patterns', () => {
    expect(matchesExcludedCompany('Northwind Staffing Ltd', ['/staffing.*ltd/i'])).toBe(
      '/staffing.*ltd/i'
    );
    expect(matchesExcludedCompany('Northwind Recruiting', ['/^northwind/'])).toBe('/^northwind/');
    expect(matchesExcludedCompany('Acme Inc', ['/^northwind/'])).toBeNull();
  });

  it('degrades invalid regex to literal matching without throwing', () => {
    expect(matchesExcludedCompany('Acme/([/Ltd', ['/([/'])).toBe('/([/');
    expect(matchesExcludedCompany('Other Corp', ['/([/'])).toBeNull();
  });

  it('ignores blanks, overlong entries, and empty companies', () => {
    expect(matchesExcludedCompany('', ['staffing partners'])).toBeNull();
    expect(matchesExcludedCompany(null, ['perzundaft'])).toBeNull();
    expect(matchesExcludedCompany('Acme', [])).toBeNull();
    expect(matchesExcludedCompany('Acme', 'not-json')).toBeNull();
    expect(parseCompanyPattern('x'.repeat(201))).toBeNull();
  });

  it('accepts JSON-encoded pattern lists', () => {
    expect(matchesExcludedCompany('Example Staffing Partners Ltd', '["staffing partners"]')).toBe('staffing partners');
  });
});
