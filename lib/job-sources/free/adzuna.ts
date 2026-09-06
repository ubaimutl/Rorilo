import type { JobSearchParams, JobSourceSearchResult, NormalizedJobInput } from '../types';
import {
  detectRemoteType,
  extractTechnologies,
  sanitizeDescription,
} from '../../jobs/normalize';
import { fetchJson } from './utils';
import { getFreeSourceKeys } from './config';
import { currencyForCountry, normalizeCountryCode } from '../countries';

type AdzunaJob = {
  id?: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  description?: string;
  redirect_url?: string;
  created?: string;
  contract_type?: string;
  contract_time?: string;
  category?: { label?: string };
};

const ADZUNA_COUNTRIES = new Set([
  'AT', 'AU', 'BR', 'CA', 'DE', 'FR', 'GB', 'IN', 'IT', 'NL', 'NZ', 'PL', 'SG', 'US', 'ZA',
]);

async function adzunaKeys(): Promise<{ appId: string; appKey: string }> {
  const keys = await getFreeSourceKeys();
  if (!keys.adzunaAppId || !keys.adzunaAppKey) {
    throw new Error(
      'Adzuna keys missing. Add them in Settings > Free Sources (free signup at developer.adzuna.com).'
    );
  }
  return { appId: keys.adzunaAppId, appKey: keys.adzunaAppKey };
}

function maxDaysOld(datePosted?: string): string | undefined {
  if (datePosted === '24h') return '1';
  if (datePosted === 'week') return '7';
  if (datePosted === 'month') return '30';
  return undefined;
}

function adzunaCountry(country?: string): string {
  const code = normalizeCountryCode(country);
  if (!ADZUNA_COUNTRIES.has(code)) {
    throw new Error(`Adzuna does not support ${code}. Choose another source for this country.`);
  }
  return code;
}

export function normalizeAdzunaJob(item: AdzunaJob, countryCode = 'DE'): NormalizedJobInput {
  const description = sanitizeDescription(item.description || '');
  const time = String(item.contract_time || '').toLowerCase();
  const type = String(item.contract_type || '').toLowerCase();
  const employmentType = time.includes('full')
    ? 'full-time'
    : time.includes('part')
      ? 'part-time'
      : type.includes('contract')
        ? 'contract'
        : undefined;
  return {
    source: 'adzuna',
    sourceJobId: `adzuna:${item.id}`,
    title: (item.title || 'Untitled Position').trim(),
    company: (item.company?.display_name || 'Unknown Company').trim(),
    location: (item.location?.display_name || '').trim(),
    countryCode,
    remoteType: detectRemoteType(item.title || '', item.location?.display_name || '', description),
    employmentType,
    salaryMin: item.salary_min,
    salaryMax: item.salary_max,
    salaryCurrency: item.salary_min || item.salary_max ? currencyForCountry(countryCode) : undefined,
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: extractTechnologies(`${item.title || ''} ${description}`),
    languageRequirements: [],
    applicationUrl: item.redirect_url,
    originalUrl: item.redirect_url,
    datePosted: item.created ? new Date(item.created) : new Date(),
    rawData: item as unknown as Record<string, unknown>,
  };
}

export async function searchAdzuna(params: JobSearchParams): Promise<JobSourceSearchResult> {
  const { appId, appKey } = await adzunaKeys();
  const countryCode = adzunaCountry(params.country);
  const apiCountry = countryCode.toLowerCase();
  const limit = Math.max(1, Math.min(params.limit || 20, 50));
  const query = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    what: [params.title, ...(params.keywords || [])].filter(Boolean).join(' ').trim(),
    where: (params.location || '').trim(),
    results_per_page: String(limit),
    'content-type': 'application/json',
  });
  const days = maxDaysOld(params.datePosted);
  if (days) query.set('max_days_old', days);

  const data = (await fetchJson(`https://api.adzuna.com/v1/api/jobs/${apiCountry}/search/1?${query.toString()}`)) as {
    results?: AdzunaJob[];
  };
  if (!data || !Array.isArray(data.results)) {
    throw new Error('Adzuna returned an unexpected response. Check your keys and try again.');
  }
  const jobs = data.results.map((item) => normalizeAdzunaJob(item, countryCode));
  return {
    jobs,
    totalDiscovered: jobs.length,
    source: 'Adzuna (Free)',
    rawPayload: undefined,
  };
}
