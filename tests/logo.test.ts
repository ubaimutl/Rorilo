import { describe, it, expect } from 'vitest';
import { extractDomain, isValidDomain, logoProxyUrl, logoDomainFor, logoNameProxyUrl, isJobBoardDomain, storedLogoFromRaw, withStoredLogo } from '../lib/logo';

describe('Logo domain helpers', () => {
  it('extracts domains from full URLs', () => {
    expect(extractDomain('https://jobs.example.com/posting/123?utm_source=x')).toBe('jobs.example.com');
    expect(extractDomain('http://www.company.de/careers')).toBe('company.de');
  });

  it('accepts bare domains and strips www', () => {
    expect(extractDomain('example.com')).toBe('example.com');
    expect(extractDomain('  WWW.EXAMPLE.COM  ')).toBe('example.com');
  });

  it('rejects company names and garbage', () => {
    expect(extractDomain('Example Association')).toBeNull();
    expect(extractDomain('not a domain!!')).toBeNull();
    expect(extractDomain('')).toBeNull();
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain('localhost')).toBeNull();
  });

  it('validates proxy domains strictly', () => {
    expect(isValidDomain('github.com')).toBe(true);
    expect(isValidDomain('https://github.com')).toBe(false);
    expect(isValidDomain('evil.com/steal')).toBe(false);
  });

  it('builds proxy URLs with clamped sizes', () => {
    expect(logoProxyUrl('github.com', 64)).toBe('/api/logo?domain=github.com&size=64&v=2');
    expect(logoProxyUrl('github.com', 5000)).toBe('/api/logo?domain=github.com&size=512&v=2');
  });

  it('blocks job-board domains from logo resolution', () => {
    expect(isJobBoardDomain('stepstone.de')).toBe(true);
    expect(isJobBoardDomain('www.linkedin.com')).toBe(true);
    expect(logoDomainFor('https://www.stepstone.de/cmp/en/example-office-5033024/work')).toBeNull();
    expect(logoDomainFor('https://acme-corp.de/careers')).toBe('acme-corp.de');
    expect(logoDomainFor(null)).toBeNull();
  });

  it('builds name lookup proxy URLs', () => {
    expect(logoNameProxyUrl('Example Learning Center Ltd', 64)).toBe(
      '/api/logo?name=Example%20Learning%20Center%20Ltd&size=64&v=2'
    );
    expect(logoNameProxyUrl('Example Workflow Inc', 64)).toBe(
      '/api/logo?name=Example%20Workflow%20Inc&size=64&v=2'
    );
  });

  it('recovers scraper logos from stored raw payloads', () => {
    const raw = JSON.stringify({ companyLogoUrl: 'https://www.stepstone.de/upload_de/logo/alt/147212.png' });
    expect(storedLogoFromRaw(raw)).toBe('https://www.stepstone.de/upload_de/logo/alt/147212.png');
    expect(storedLogoFromRaw('not json')).toBeNull();
    expect(storedLogoFromRaw(null)).toBeNull();
    expect(withStoredLogo({ companyLogo: null, rawData: raw }).companyLogo).toBe(
      'https://www.stepstone.de/upload_de/logo/alt/147212.png'
    );
    expect(
      withStoredLogo({ companyLogo: 'https://kept.example/logo.png', rawData: raw }).companyLogo
    ).toBe('https://kept.example/logo.png');
  });
});
