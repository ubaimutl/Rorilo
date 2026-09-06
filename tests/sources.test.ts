import { describe, it, expect } from 'vitest';
import { mergeAvailableActors, KNOWN_JOB_SOURCES, resolveSourceAdapter, orderApifyPicker } from '../lib/job-sources/sources';

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
