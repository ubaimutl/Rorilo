import type { JobSearchParams, JobSourceSearchResult, NormalizedJobInput } from '../types';
import {
  detectRemoteType,
  extractTechnologies,
  parseSalary,
  sanitizeDescription,
} from '../../jobs/normalize';
import {
  cachedFetchJson,
  fetchJson,
  matchesKeywords,
  remoteLocationKeeps,
} from './utils';
import { countryRegion, normalizeCountryCode } from '../countries';

const HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Arbeitnow — paginated public API, full HTML descriptions, no key.
// ---------------------------------------------------------------------------

type ArbeitnowItem = {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: string;
};

export function normalizeArbeitnow(item: ArbeitnowItem): NormalizedJobInput {
  const description = sanitizeDescription(item.description || '');
  const location = (item.location || '').trim();
  return {
    source: 'arbeitnow',
    sourceJobId: `arbeitnow:${item.slug || item.title}`,
    title: (item.title || 'Untitled Position').trim(),
    company: (item.company_name || 'Unknown Company').trim(),
    location,
    remoteType: item.remote ? 'remote' : detectRemoteType(item.title || '', location, description),
    employmentType: (item.job_types || []).join(', ') || undefined,
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: Array.from(
      new Set([
        ...extractTechnologies(`${item.title || ''} ${description}`),
        ...((item.tags || []).filter((tag) => typeof tag === 'string' && tag.length <= 24) as string[]),
      ])
    ),
    languageRequirements: [],
    applicationUrl: item.url,
    originalUrl: item.url,
    datePosted: item.created_at ? new Date(item.created_at) : new Date(),
    rawData: item as unknown as Record<string, unknown>,
  };
}

export async function searchArbeitnow(params: JobSearchParams): Promise<JobSourceSearchResult> {
  if (normalizeCountryCode(params.country) !== 'DE') {
    return { jobs: [], totalDiscovered: 0, source: 'Arbeitnow (Free)', rawPayload: undefined };
  }
  const limit = Math.max(1, Math.min(params.limit || 20, 60));
  // Pages hold the newest jobs across all industries, so scan several pages
  // until the keyword-filtered limit is filled (single pages rarely contain
  // niche terms). Sequential with a small delay — parallel bursts trigger
  // Cloudflare challenges on this host.
  const jobs: NormalizedJobInput[] = [];

  for (let page = 1; page <= 6; page += 1) {
    if (page > 1) await new Promise((resolve) => setTimeout(resolve, 500));
    const data = (await cachedFetchJson(`arbeitnow:page:${page}`, HOUR, () =>
      fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`)
    )) as { data?: ArbeitnowItem[] };
    if (!data || !Array.isArray(data.data)) {
      throw new Error('Arbeitnow returned an unexpected response (possible bot check). Try again later.');
    }
    const batch = data.data;
    for (const item of batch) {
      const normalized = normalizeArbeitnow(item);
      if (
        matchesKeywords(
          `${normalized.title} ${(item.tags || []).join(' ')} ${normalized.description.slice(0, 2000)}`,
          params.title,
          params.keywords
        ) &&
        remoteLocationKeeps(params.country, params.location, normalized.location || '')
      ) {
        jobs.push(normalized);
      }
      if (jobs.length >= limit) break;
    }
    if (batch.length === 0 || jobs.length >= limit) break;
  }

  return {
    jobs: jobs.slice(0, limit),
    totalDiscovered: jobs.length,
    source: 'Arbeitnow (Free)',
    rawPayload: undefined,
  };
}

// ---------------------------------------------------------------------------
// Jobicy — filtered public API (credit + link back in originalUrl).
// ---------------------------------------------------------------------------

type JobicyItem = {
  id?: number;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string;
  jobDescription?: string;
  jobExcerpt?: string;
  jobGeo?: string;
  jobIndustry?: string | string[];
  jobType?: string | string[];
  pubDate?: string;
};

function jobicyText(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    const parts = value.filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeJobicy(item: JobicyItem): NormalizedJobInput {
  const description = sanitizeDescription(item.jobDescription || item.jobExcerpt || '');
  const location = (item.jobGeo || '').trim();
  return {
    source: 'jobicy',
    sourceJobId: `jobicy:${item.id}`,
    title: (item.jobTitle || 'Untitled Position').trim(),
    company: (item.companyName || 'Unknown Company').trim(),
    companyLogo: item.companyLogo || undefined,
    location,
    remoteType: detectRemoteType(item.jobTitle || '', location, description),
    employmentType: jobicyText(item.jobType),
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: extractTechnologies(`${item.jobTitle || ''} ${description}`),
    languageRequirements: [],
    applicationUrl: item.url,
    originalUrl: item.url,
    datePosted: item.pubDate ? new Date(item.pubDate) : new Date(),
    rawData: item as unknown as Record<string, unknown>,
  };
}

export async function searchJobicy(params: JobSearchParams): Promise<JobSourceSearchResult> {
  const limit = Math.max(1, Math.min(params.limit || 20, 60));
  // Jobicy's public endpoint occasionally rejects otherwise valid geo and
  // industry combinations with HTTP 400. Fetch the stable base feed and
  // apply Rorilo's country and keyword filters locally.
  const query = new URLSearchParams({ count: '100' });
  const data = (await cachedFetchJson(`jobicy:${query.toString()}`, HOUR, () =>
    fetchJson(`https://jobicy.com/api/v2/remote-jobs?${query.toString()}`, {
      headers: { 'User-Agent': 'Rorilo job search (https://github.com/ubaimutl/Rorilo)' },
    })
  )) as { jobs?: JobicyItem[] };
  if (!data || !Array.isArray(data.jobs)) {
    throw new Error('Jobicy returned an unexpected response. Try again later.');
  }
  const items = data.jobs;
  const jobs = items
    .map(normalizeJobicy)
    .filter(
      (job) =>
        matchesKeywords(
          `${job.title} ${job.description.slice(0, 2000)}`,
          params.title,
          params.keywords
        ) && remoteLocationKeeps(params.country, params.location, job.location || '')
    )
    .slice(0, limit);
  return {
    jobs,
    totalDiscovered: jobs.length,
    source: 'Jobicy (Free)',
    rawPayload: undefined,
  };
}

// ---------------------------------------------------------------------------
// Remote OK — full JSON feed, filter locally (mention + link back honored
// via source label and originalUrl).
// ---------------------------------------------------------------------------

type RemoteOkItem = {
  id?: string;
  slug?: string;
  date?: string;
  company?: string;
  company_logo?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  apply_url?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
};

export function normalizeRemoteOk(item: RemoteOkItem): NormalizedJobInput {
  const description = sanitizeDescription(item.description || '');
  const location = (item.location || '').trim();
  return {
    source: 'remoteok',
    sourceJobId: `remoteok:${item.id || item.slug}`,
    title: (item.position || 'Untitled Position').trim(),
    company: (item.company || 'Unknown Company').trim(),
    companyLogo: item.company_logo || undefined,
    location,
    remoteType: detectRemoteType(item.position || '', location, description),
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: Array.from(
      new Set([
        ...extractTechnologies(`${item.position || ''} ${description}`),
        ...((item.tags || []).filter((tag) => typeof tag === 'string' && tag.length <= 24) as string[]),
      ])
    ),
    languageRequirements: [],
    salaryMin: typeof item.salary_min === 'number' && item.salary_min > 0 ? item.salary_min : undefined,
    salaryMax: typeof item.salary_max === 'number' && item.salary_max > 0 ? item.salary_max : undefined,
    applicationUrl: item.apply_url || item.url,
    originalUrl: item.url,
    datePosted: item.date ? new Date(item.date) : new Date(),
    rawData: item as unknown as Record<string, unknown>,
  };
}

export async function searchRemoteOk(params: JobSearchParams): Promise<JobSourceSearchResult> {
  const limit = Math.max(1, Math.min(params.limit || 20, 60));
  const data = (await cachedFetchJson('remoteok:feed', HOUR, () =>
    fetchJson('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Rorilo/1.0 (personal job search)' },
    })
  )) as RemoteOkItem[];
  if (!Array.isArray(data)) {
    throw new Error('Remote OK returned an unexpected response. Try again later.');
  }
  const items = data.filter((item) => item && item.id);
  const jobs = items
    .map(normalizeRemoteOk)
    .filter(
      (job) =>
        matchesKeywords(`${job.title} ${job.technologies.join(' ')}`, params.title, params.keywords) &&
        remoteLocationKeeps(params.country, params.location, job.location || '')
    )
    .slice(0, limit);
  return {
    jobs,
    totalDiscovered: jobs.length,
    source: 'Remote OK (Free)',
    rawPayload: undefined,
  };
}

// ---------------------------------------------------------------------------
// Remotive — searchable API (≤4 fetches/day requested; cached 6h).
// ---------------------------------------------------------------------------

type RemotiveItem = {
  id?: number;
  title?: string;
  company_name?: string;
  company_logo?: string;
  company_logo_url?: string;
  candidate_required_location?: string;
  category?: string;
  job_type?: string;
  salary?: string;
  description?: string;
  url?: string;
  publication_date?: string;
  tags?: string[];
};

export function normalizeRemotive(item: RemotiveItem): NormalizedJobInput {
  const description = sanitizeDescription(item.description || '');
  const location = (item.candidate_required_location || '').trim();
  const salary = parseSalary(item.salary);
  const employmentRaw = String(item.job_type || '').toLowerCase();
  return {
    source: 'remotive',
    sourceJobId: `remotive:${item.id}`,
    title: (item.title || 'Untitled Position').trim(),
    company: (item.company_name || 'Unknown Company').trim(),
    companyLogo: item.company_logo || item.company_logo_url || undefined,
    location,
    remoteType: detectRemoteType(item.title || '', location, description),
    employmentType: employmentRaw.includes('full')
      ? 'full-time'
      : employmentRaw.includes('part')
        ? 'part-time'
        : employmentRaw.includes('contract')
          ? 'contract'
          : undefined,
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryCurrency: salary.salaryCurrency,
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: extractTechnologies(`${item.title || ''} ${description}`),
    languageRequirements: [],
    applicationUrl: item.url,
    originalUrl: item.url,
    datePosted: item.publication_date ? new Date(item.publication_date) : new Date(),
    rawData: item as unknown as Record<string, unknown>,
  };
}

export async function searchRemotive(params: JobSearchParams): Promise<JobSourceSearchResult> {
  const limit = Math.max(1, Math.min(params.limit || 20, 60));
  const keyword = [params.title, ...(params.keywords || [])].filter(Boolean).join(' ').trim();
  const query = new URLSearchParams({ limit: '100' });
  if (keyword) query.set('search', keyword);
  if (params.remote === 'remote') query.set('category', 'software-dev');
  const data = (await cachedFetchJson(`remotive:${query.toString()}`, 6 * HOUR, () =>
    fetchJson(`https://remotive.com/api/remote-jobs?${query.toString()}`)
  )) as { jobs?: RemotiveItem[] };
  if (!data || !Array.isArray(data.jobs)) {
    throw new Error('Remotive returned an unexpected response. Try again later.');
  }
  const items = data.jobs;
  const jobs = items
    .map(normalizeRemotive)
    .filter((job, index) => {
      const raw = items[index];
      return (
        matchesKeywords(
          `${job.title} ${(raw.tags || []).join(' ')} ${raw.category || ''} ${job.description.slice(0, 2000)}`,
          params.title,
          params.keywords
        ) && remoteLocationKeeps(params.country, params.location, job.location || '')
      );
    })
    .slice(0, limit);
  return {
    jobs,
    totalDiscovered: jobs.length,
    source: 'Remotive (Free)',
    rawPayload: undefined,
  };
}
