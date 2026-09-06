import type { JobSearchParams, JobSourceSearchResult } from '../types';
import { searchArbeitsagentur } from './arbeitsagentur';
import { searchAdzuna } from './adzuna';
import { searchTechmap } from './techmap';
import { searchAtsBoards } from './ats';
import { getEffectiveAtsBoards } from './config';
import { searchArbeitnow, searchJobicy, searchRemoteOk, searchRemotive } from './remote';
import { normalizeCountryCode, sourceCoveragePriority, type SourceCoverage } from '../countries';

export type FreeSourceGroup = 'direct' | 'remote' | 'boards' | 'keyed';

export const FREE_SOURCE_GROUPS: Array<{ id: FreeSourceGroup; label: string; hint: string }> = [
  { id: 'remote', label: 'Remote feeds', hint: 'remote-only boards, cached politely' },
  { id: 'boards', label: 'Company boards', hint: 'career pages, managed in Settings' },
  { id: 'direct', label: 'Country feeds', hint: 'official and country-specific feeds' },
  { id: 'keyed', label: 'Keyed APIs', hint: 'free allowances, keys in Settings' },
];

export interface FreeSourceDef {
  id: string;
  name: string;
  tagline: string;
  coverage: SourceCoverage;
  cost: string;
  needsKey: boolean;
  group: FreeSourceGroup;
  recommendedFor?: string[];
  run: (params: JobSearchParams) => Promise<JobSourceSearchResult>;
}

export const FREE_SOURCES: Record<string, FreeSourceDef> = {
  arbeitsagentur: {
    id: 'arbeitsagentur',
    name: 'Arbeitsagentur',
    tagline: 'Federal job board — full descriptions, no keys needed',
    coverage: { countries: ['DE'] },
    cost: 'Free',
    needsKey: false,
    group: 'direct',
    recommendedFor: ['DE'],
    run: searchArbeitsagentur,
  },
  arbeitnow: {
    id: 'arbeitnow',
    name: 'Arbeitnow',
    tagline: 'Aggregated Germany tech jobs incl. visa info, no keys needed',
    coverage: { countries: ['DE'] },
    cost: 'Free',
    needsKey: false,
    group: 'direct',
    recommendedFor: ['DE'],
    run: searchArbeitnow,
  },
  jobicy: {
    id: 'jobicy',
    name: 'Jobicy',
    tagline: 'Remote jobs with regional filters, no keys needed',
    coverage: { global: true },
    cost: 'Free',
    needsKey: false,
    group: 'remote',
    run: searchJobicy,
  },
  remoteok: {
    id: 'remoteok',
    name: 'Remote OK',
    tagline: 'Remote feed, cached hourly, no keys needed',
    coverage: { global: true },
    cost: 'Free',
    needsKey: false,
    group: 'remote',
    run: searchRemoteOk,
  },
  remotive: {
    id: 'remotive',
    name: 'Remotive',
    tagline: 'Searchable remote jobs, cached 6h, no keys needed',
    coverage: { global: true },
    cost: 'Free',
    needsKey: false,
    group: 'remote',
    run: searchRemotive,
  },
  ats: {
    id: 'ats',
    name: 'Company boards',
    tagline: 'Greenhouse, Lever, Ashby & Personio career pages — no keys needed',
    coverage: { global: true },
    cost: 'Free',
    needsKey: false,
    group: 'boards',
    run: async (params: JobSearchParams) =>
      searchAtsBoards(params, await getEffectiveAtsBoards()),
  },
  adzuna: {
    id: 'adzuna',
    name: 'Adzuna',
    tagline: 'Aggregator search across the web, free allowance',
    coverage: { countries: ['DE', 'AT', 'AU', 'BR', 'CA', 'FR', 'GB', 'IN', 'IT', 'NL', 'NZ', 'PL', 'SG', 'US', 'ZA'] },
    cost: 'Free allowance',
    needsKey: true,
    group: 'keyed',
    run: searchAdzuna,
  },
  techmap: {
    id: 'techmap',
    name: 'Techmap',
    tagline: 'Structured job search by country, JSON-LD payloads, free tier',
    coverage: { countries: ['DE', 'AT', 'CH', 'FR', 'NL', 'GB', 'US', 'CA', 'AU', 'ES', 'IT', 'PL'] },
    cost: 'Free tier',
    needsKey: true,
    group: 'keyed',
    run: searchTechmap,
  },
};

export function resolveFreeSource(id: unknown): FreeSourceDef | null {
  if (typeof id !== 'string') return null;
  return FREE_SOURCES[id.trim().toLowerCase()] || null;
}

export function orderFreeSources(country?: string): FreeSourceDef[] {
  const code = normalizeCountryCode(country);
  return Object.values(FREE_SOURCES).sort((a, b) => {
    const coverageOrder = sourceCoveragePriority(a.coverage, code) - sourceCoveragePriority(b.coverage, code);
    if (coverageOrder !== 0) return coverageOrder;
    const aRecommended = a.recommendedFor?.includes(code) || false;
    const bRecommended = b.recommendedFor?.includes(code) || false;
    if (aRecommended !== bRecommended) return aRecommended ? -1 : 1;

    const groupOrder = FREE_SOURCE_GROUPS.findIndex((group) => group.id === a.group) -
      FREE_SOURCE_GROUPS.findIndex((group) => group.id === b.group);
    if (groupOrder !== 0) return groupOrder;
    return a.name.localeCompare(b.name);
  });
}
