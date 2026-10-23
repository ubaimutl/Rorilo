import { describe, it, expect } from 'vitest';
import { mergeAvailableActors, KNOWN_JOB_SOURCES, resolveSourceAdapter, orderApifyPicker, adaptGoogleJobPayload } from '../lib/job-sources/sources';
import { sourceCoversCountry } from '../lib/job-sources/countries';
import { normalizeJobPayload } from '../lib/jobs/normalize';

describe('Available actor merging', () => {
  it('unions saved actors with built-in defaults, saved first', () => {
    const actors = mergeAvailableActors(['custom-user/my-actor']);
    expect(actors[0]).toBe('custom-user/my-actor');
    for (const source of Object.values(KNOWN_JOB_SOURCES)) {
      expect(actors).toContain(source.actorId);
    }
  });

  it('dedupes actors already saved', () => {
    const actors = mergeAvailableActors(['curious_coder/linkedin-jobs-scraper']);
    const occurrences = actors.filter((actor) => actor === 'curious_coder/linkedin-jobs-scraper');
    expect(occurrences).toHaveLength(1);
  });

  it('falls back to built-ins when nothing is saved', () => {
    const actors = mergeAvailableActors([]);
    expect(actors).toEqual(Object.values(KNOWN_JOB_SOURCES).map((source) => source.actorId));
    expect(mergeAvailableActors(undefined)).toEqual(actors);
  });

  it('ignores blank entries', () => {
    const actors = mergeAvailableActors(['  ', 'custom-user/my-actor']);
    expect(actors[0]).toBe('custom-user/my-actor');
  });

  it('points the StepStone adapter at the details-capable actor', () => {
    const adapter = resolveSourceAdapter('stepstone');
    expect(adapter.actorId).toBe('trakk/stepstone-jobs-scraper');
    const input = adapter.buildInput({ title: 'Data Entry', location: 'Sample City', limit: 5 });
    expect(input).toMatchObject({
      mode: 'SEARCH',
      keywords: ['Data Entry'],
      location: 'sample city',
      country: 'DE',
      maxItems: 5,
      includeDetails: false,
    });
  });

  it('keeps the legacy StepStone actor runnable', () => {
    const adapter = resolveSourceAdapter('memo23/stepstone-search-cheerio-ppr');
    expect(adapter.actorId).toBe('memo23/stepstone-search-cheerio-ppr');
    const input = adapter.buildInput({ title: 'Dev', location: 'Sample City', limit: 5 }) as Record<string, unknown>;
    expect(input['keyword']).toBe('Dev');
  });

  it('orders global Apify sources before selected-country sources', () => {
    const ordered = orderApifyPicker(KNOWN_JOB_SOURCES, 'DE');
    expect(ordered).toHaveLength(Object.keys(KNOWN_JOB_SOURCES).length);
    const firstCountrySource = ordered.findIndex((source) => !source.coverage.global);
    expect(firstCountrySource).toBeGreaterThan(0);
    expect(ordered.slice(0, firstCountrySource).every((source) => source.coverage.global)).toBe(true);
    expect(ordered[firstCountrySource].coverage.countries || ordered[firstCountrySource].coverage.regions).toBeTruthy();
    expect(ordered[0].name).toBe('Indeed');
  });
});

const googleJobRows = [
  {
    title: 'Backend Engineer',
    job_title: 'Backend Engineer',
    company_name: 'Northwind Labs',
    location: 'Berlin, Germany',
    description: 'Build APIs.',
    job_id: 'gj-1001',
    share_link: 'https://www.google.com/search?q=job-1001',
    apply_options: [{ title: 'Apply', link: 'https://jobs.example.com/1001' }],
  },
  {
    title: 'Data Analyst',
    company_name: 'Harbor Co',
    location: 'London, UK',
    description: 'Analyze reports.',
    job_id: 'gj-1002',
    share_link: 'https://www.google.com/search?q=job-1002',
    apply_options: [],
  },
];

describe('Google Jobs actor', () => {
  it('points the source at johnvc and keeps it off by default', () => {
    const adapter = resolveSourceAdapter('google');
    expect(adapter.actorId).toBe('johnvc/Google-Jobs-Scraper');
    expect(KNOWN_JOB_SOURCES.google.defaultEnabled).toBe(false);
  });

  it('clamps num_results to the actor minimum of 10', () => {
    const adapter = resolveSourceAdapter('google');
    expect(adapter.buildInput({ title: 'Backend', keywords: ['Python'], country: 'DE', location: 'Berlin', limit: 5 })).toEqual({
      query: 'Backend Python',
      location: 'Berlin',
      country: 'de',
      num_results: 10,
      max_pagination: 1,
    });
    expect(adapter.buildInput({ title: 'Dev', country: 'DE', limit: 3 }).num_results).toBe(10);
    expect(adapter.buildInput({ title: 'Dev', country: 'DE', limit: 9 }).num_results).toBe(10);
    const twenty = adapter.buildInput({ title: 'Analyst', country: 'GB', limit: 20 });
    expect(twenty.country).toBe('uk');
    expect(twenty.num_results).toBe(20);
    expect(twenty.max_pagination).toBe(2);
  });

  it('rejects countries Google Jobs does not serve', () => {
    const adapter = resolveSourceAdapter('google');
    for (const country of ['FR', 'AU', 'PL'] as const) {
      expect(() => adapter.buildInput({ title: 'Analyst', country, location: 'Paris', limit: 10 })).toThrow(
        `Google Jobs does not support ${country}. Choose another source for this country.`
      );
    }
  });

  it('is not offered as a global source for unsupported countries', () => {
    expect(KNOWN_JOB_SOURCES.google.coverage.global).toBeUndefined();
    expect(sourceCoversCountry(KNOWN_JOB_SOURCES.google.coverage, 'DE')).toBe(true);
    expect(sourceCoversCountry(KNOWN_JOB_SOURCES.google.coverage, 'GB')).toBe(true);
    expect(sourceCoversCountry(KNOWN_JOB_SOURCES.google.coverage, 'FR')).toBe(false);
    expect(sourceCoversCountry(KNOWN_JOB_SOURCES.google.coverage, 'AU')).toBe(false);
    expect(sourceCoversCountry(KNOWN_JOB_SOURCES.google.coverage, 'PL')).toBe(false);
  });

  it('maps recorded johnvc rows onto the existing normalizer fields', () => {
    const jobs = googleJobRows.map((row) => normalizeJobPayload(adaptGoogleJobPayload(row), 'Google Jobs'));

    expect(jobs[0]).toMatchObject({
      title: 'Backend Engineer',
      company: 'Northwind Labs',
      location: 'Berlin, Germany',
      sourceJobId: 'gj-1001',
      applicationUrl: 'https://jobs.example.com/1001',
      originalUrl: 'https://www.google.com/search?q=job-1001',
    });
    expect(jobs[1]).toMatchObject({
      title: 'Data Analyst',
      company: 'Harbor Co',
      location: 'London, UK',
      sourceJobId: 'gj-1002',
      applicationUrl: 'https://www.google.com/search?q=job-1002',
      originalUrl: 'https://www.google.com/search?q=job-1002',
    });
    expect(adaptGoogleJobPayload(googleJobRows[0]).company_name).toBe('Northwind Labs');
  });
});
