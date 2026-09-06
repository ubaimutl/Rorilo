import type { JobSearchParams, JobSourceSearchResult, NormalizedJobInput } from '../types';
import {
  detectRemoteType,
  extractTechnologies,
  sanitizeDescription,
} from '../../jobs/normalize';
import { fetchJson } from './utils';
import { getFreeSourceKeys } from './config';
import { normalizeCountryCode } from '../countries';

const TECHMAP_BASE = 'https://daily-international-job-postings.p.rapidapi.com/api/v2/jobs';

async function techmapKey(): Promise<string> {
  const keys = await getFreeSourceKeys();
  if (!keys.techmapKey) {
    throw new Error(
      'Techmap key missing. Add it in Settings > Free Sources (free Basic plan on RapidAPI).'
    );
  }
  return keys.techmapKey;
}

function daysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function rangeStart(datePosted?: string): string {
  if (datePosted === '24h') return daysAgo(1);
  if (datePosted === 'week') return daysAgo(7);
  if (datePosted === 'month') return daysAgo(30);
  return daysAgo(30);
}

type TechmapJsonLd = {
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  url?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: { name?: string; address?: { addressLocality?: string; addressCountry?: string } };
  baseSalary?: { currency?: string; value?: { minValue?: number | string; maxValue?: number | string } };
};

export type TechmapJob = {
  title?: string;
  company?: string;
  city?: string;
  countryCode?: string;
  skills?: string[];
  workPlace?: string[];
  workType?: string[];
  contractType?: string[];
  jsonLD?: TechmapJsonLd;
};

function pickNumber(value: unknown): number | undefined {
  const num = typeof value === 'string' ? Number(value) : (value as number);
  return typeof num === 'number' && Number.isFinite(num) && num > 0 ? num : undefined;
}

export function normalizeTechmapJob(item: TechmapJob): NormalizedJobInput {
  const jsonLd = item.jsonLD || {};
  const title = (item.title || jsonLd.title || 'Untitled Position').trim();
  const company = (item.company || jsonLd.hiringOrganization?.name || 'Unknown Company').trim();
  const location =
    item.city ||
    jsonLd.jobLocation?.name ||
    jsonLd.jobLocation?.address?.addressLocality ||
    '';
  const description = sanitizeDescription(jsonLd.description || '');
  const employmentRaw = [
    ...(Array.isArray(jsonLd.employmentType) ? jsonLd.employmentType : [jsonLd.employmentType]),
    ...((item.workType || []) as string[]),
    ...((item.contractType || []) as string[]),
  ]
    .filter(Boolean)
    .join(' ');
  const employmentType = /full/i.test(employmentRaw)
    ? 'full-time'
    : /part/i.test(employmentRaw)
      ? 'part-time'
      : /contract/i.test(employmentRaw)
        ? 'contract'
        : undefined;
  const salaryCurrency = jsonLd.baseSalary?.currency;
  return {
    source: 'techmap',
    sourceJobId: `techmap:${jsonLd.url || `${company}|${title}`.slice(0, 120)}`,
    title,
    company,
    location: String(location).trim(),
    countryCode: item.countryCode?.toUpperCase(),
    remoteType: detectRemoteType(title, `${location} ${(item.workPlace || []).join(' ')}`, description),
    employmentType,
    salaryMin: pickNumber(jsonLd.baseSalary?.value?.minValue),
    salaryMax: pickNumber(jsonLd.baseSalary?.value?.maxValue),
    salaryCurrency,
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: Array.from(
      new Set([
        ...extractTechnologies(`${title} ${description}`),
        ...((item.skills || []).filter((skill) => typeof skill === 'string' && skill.length <= 24) as string[]),
      ])
    ),
    languageRequirements: [],
    applicationUrl: jsonLd.url,
    originalUrl: jsonLd.url,
    datePosted: jsonLd.datePosted ? new Date(jsonLd.datePosted) : new Date(),
    rawData: item as unknown as Record<string, unknown>,
  };
}

export async function searchTechmap(params: JobSearchParams): Promise<JobSourceSearchResult> {
  const key = await techmapKey();
  const limit = Math.max(1, Math.min(params.limit || 20, 30));
  const pages = Math.min(3, Math.max(1, Math.ceil(limit / 10)));
  const jobs: NormalizedJobInput[] = [];
  const headers = { Authorization: `Bearer ${key}` };
  const countryCode = normalizeCountryCode(params.country).toLowerCase();

  for (let page = 1; page <= pages; page += 1) {
    const query = new URLSearchParams({
      countryCode,
      title: [params.title, ...(params.keywords || [])].filter(Boolean).join(' ').trim(),
      city: (params.location || '').trim(),
      dateCreatedMin: rangeStart(params.datePosted),
      dateCreatedMax: daysAgo(0),
      page: String(page),
      format: 'json',
    });
    const data = (await fetchJson(`${TECHMAP_BASE}/search?${query.toString()}`, { headers })) as {
      result?: TechmapJob[];
    };
    if (!data || !Array.isArray(data.result)) {
      throw new Error('Techmap returned an unexpected response. Check your key and try again.');
    }
    const batch = data.result;
    jobs.push(...batch.map(normalizeTechmapJob));
    if (batch.length < 10 || jobs.length >= limit) break;
  }

  return {
    jobs: jobs.slice(0, limit),
    totalDiscovered: jobs.length,
    source: 'Techmap (Free tier)',
    rawPayload: undefined,
  };
}
