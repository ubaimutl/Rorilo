import type { JobSearchParams, JobSourceSearchResult, NormalizedJobInput } from '../types';
import {
  detectRemoteType,
  extractTechnologies,
  sanitizeDescription,
} from '../../jobs/normalize';
import type { AtsBoard } from './ats-types';
import { fetchJson, isRemoteText, matchesKeywords, remoteLocationKeeps } from './utils';
import { fetchPersonioBoard } from './personio';
import { normalizeCountryCode, sourceCoversCountry } from '../countries';

type GreenhouseListItem = {
  id?: number;
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  company_name?: string;
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string; location?: string }>;
  first_published?: string;
  updated_at?: string;
};

type GreenhouseDetail = GreenhouseListItem & {
  content?: string;
  employment_type?: string;
};

type AshbyJob = {
  id?: string;
  title?: string;
  location?: string;
  workplaceType?: string;
  isRemote?: boolean;
  isListed?: boolean;
  employmentType?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  compensation?: {
    summaryComponents?: Array<{
      compensationType?: string;
      interval?: string;
      currencyCode?: string | null;
      minValue?: number | null;
      maxValue?: number | null;
    }>;
  };
};

type LeverPosting = {
  id?: string;
  text?: string;
  categories?: { location?: string; commitment?: string; team?: string; allLocations?: string[] };
  country?: string;
  descriptionPlain?: string;
  hostedUrl?: string;
  applyUrl?: string;
  workplaceType?: string;
  salaryRange?: { currency?: string; min?: number; max?: number };
  createdAt?: number;
};

function locationKeeps(
  country: string | undefined,
  paramsLocation: string | undefined,
  remote: string | undefined,
  locationText: string,
  remoteType: NormalizedJobInput['remoteType']
): boolean {
  if (!paramsLocation?.trim()) {
    return remoteType === 'remote' ? remoteLocationKeeps(country, paramsLocation, locationText) : true;
  }
  const want = paramsLocation.trim().toLowerCase();
  if (locationText.toLowerCase().includes(want)) return true;
  if (remote === 'remote' && (remoteType === 'remote' || isRemoteText(locationText))) {
    return remoteLocationKeeps(country, paramsLocation, locationText);
  }
  return false;
}

function mapEmploymentType(value: unknown): string | undefined {
  const text = String(value || '').toLowerCase();
  if (!text) return undefined;
  if (text.includes('full')) return 'full-time';
  if (text.includes('part')) return 'part-time';
  if (text.includes('contract') || text.includes('temporary') || text.includes('freelance')) return 'contract';
  if (text.includes('intern') || text.includes('working student') || text.includes('werkstudent')) return 'internship';
  return undefined;
}

function ashbySalary(job: AshbyJob): { salaryMin?: number; salaryMax?: number; salaryCurrency?: string } {
  const salary = (job.compensation?.summaryComponents || []).find(
    (component) => component.compensationType === 'Salary' && typeof component.minValue === 'number'
  );
  if (!salary) return {};
  return {
    salaryMin: salary.minValue ?? undefined,
    salaryMax: salary.maxValue ?? salary.minValue ?? undefined,
    salaryCurrency: salary.currencyCode || 'USD',
  };
}

function boardCountry(entry: AtsBoard): string | undefined {
  return entry.countries?.length === 1 ? normalizeCountryCode(entry.countries[0]) : undefined;
}

function normalizeAshby(job: AshbyJob, entry: AtsBoard): NormalizedJobInput {
  const description = sanitizeDescription(job.descriptionPlain || '');
  const remoteType =
    job.workplaceType === 'Remote' || job.isRemote
      ? 'remote'
      : job.workplaceType === 'Hybrid'
        ? 'hybrid'
        : job.workplaceType === 'OnSite'
          ? 'onsite'
          : detectRemoteType(job.title || '', job.location || '', description);
  const salary = ashbySalary(job);
  return {
    source: 'ashby',
    sourceJobId: `ashby:${entry.board}:${job.id || job.jobUrl}`,
    title: (job.title || 'Untitled Position').trim(),
    company: entry.company,
    location: (job.location || '').trim(),
    countryCode: boardCountry(entry),
    remoteType,
    employmentType: mapEmploymentType(job.employmentType),
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryCurrency: salary.salaryCurrency,
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: extractTechnologies(`${job.title || ''} ${description}`),
    languageRequirements: [],
    applicationUrl: job.applyUrl,
    originalUrl: job.jobUrl,
    datePosted: job.publishedAt ? new Date(job.publishedAt) : new Date(),
    rawData: job as unknown as Record<string, unknown>,
  };
}

function normalizeLever(job: LeverPosting, entry: AtsBoard): NormalizedJobInput {
  const location = job.categories?.location || (job.categories?.allLocations || []).join(', ');
  const description = sanitizeDescription(job.descriptionPlain || '');
  const workplace = String(job.workplaceType || '').toLowerCase();
  const remoteType =
    workplace === 'remote'
      ? 'remote'
      : workplace === 'hybrid'
        ? 'hybrid'
        : workplace === 'on-site'
          ? 'onsite'
          : detectRemoteType(job.text || '', location, description);
  return {
    source: 'lever',
    sourceJobId: `lever:${entry.board}:${job.id}`,
    title: (job.text || 'Untitled Position').trim(),
    company: entry.company,
    location: location.trim(),
    countryCode: job.country ? normalizeCountryCode(job.country) : boardCountry(entry),
    remoteType,
    employmentType: mapEmploymentType(job.categories?.commitment),
    salaryMin: job.salaryRange?.min,
    salaryMax: job.salaryRange?.max,
    salaryCurrency: job.salaryRange?.currency,
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: extractTechnologies(`${job.text || ''} ${description}`),
    languageRequirements: [],
    applicationUrl: job.applyUrl,
    originalUrl: job.hostedUrl,
    datePosted: job.createdAt ? new Date(job.createdAt) : new Date(),
    rawData: job as unknown as Record<string, unknown>,
  };
}

function normalizeGreenhouse(
  job: GreenhouseDetail,
  entry: AtsBoard
): NormalizedJobInput {
  const offices = (job.offices || [])
    .map((office) => office.name || office.location || '')
    .filter(Boolean)
    .join(', ');
  const location = job.location?.name || offices;
  const description = sanitizeDescription(job.content || '');
  const departments = (job.departments || []).map((dept) => dept.name || '').join(' ');
  return {
    source: 'greenhouse',
    sourceJobId: `greenhouse:${entry.board}:${job.id}`,
    title: (job.title || 'Untitled Position').trim(),
    company: job.company_name || entry.company,
    location: (location || '').trim(),
    countryCode: boardCountry(entry),
    remoteType: detectRemoteType(job.title || '', `${location} ${offices}`, description),
    employmentType: mapEmploymentType(job.employment_type),
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: extractTechnologies(`${job.title || ''} ${departments} ${description}`),
    languageRequirements: [],
    applicationUrl: job.absolute_url,
    originalUrl: job.absolute_url,
    datePosted: job.first_published ? new Date(job.first_published) : new Date(),
    rawData: job as unknown as Record<string, unknown>,
  };
}

async function fetchGreenhouseBoard(
  entry: AtsBoard,
  params: JobSearchParams
): Promise<NormalizedJobInput[]> {
  // content=true embeds full descriptions — no per-job detail calls needed.
  const list = (await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${entry.board}/jobs?content=true`
  )) as { jobs?: GreenhouseListItem[] };
  if (!list || !Array.isArray(list.jobs)) {
    throw new Error(`Greenhouse board "${entry.board}" returned an unexpected response.`);
  }
  const items = list.jobs;
  return items
    .map((item) => normalizeGreenhouse(item, entry))
    .filter(
      (job) =>
        matchesKeywords(
          `${job.title} ${job.technologies.join(' ')}`,
          params.title,
          params.keywords
        ) && locationKeeps(params.country, params.location, params.remote, job.location || '', job.remoteType)
    );
}

async function fetchAshbyBoard(
  entry: AtsBoard,
  params: JobSearchParams
): Promise<NormalizedJobInput[]> {
  const data = (await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${entry.board}?includeCompensation=true`
  )) as { jobs?: AshbyJob[] };
  if (!data || !Array.isArray(data.jobs)) {
    throw new Error(`Ashby board "${entry.board}" returned an unexpected response.`);
  }
  const items = data.jobs;
  return items
    .filter((item) => item.isListed !== false)
    .map((item) => normalizeAshby(item, entry))
    .filter(
      (job) =>
        matchesKeywords(
          `${job.title} ${job.technologies.join(' ')}`,
          params.title,
          params.keywords
        ) && locationKeeps(params.country, params.location, params.remote, job.location || '', job.remoteType)
    );
}

async function fetchLeverBoard(
  entry: AtsBoard,
  params: JobSearchParams
): Promise<NormalizedJobInput[]> {
  const data = (await fetchJson(
    `https://api.lever.co/v0/postings/${entry.board}?mode=json&limit=100`
  )) as LeverPosting[];
  if (!Array.isArray(data)) {
    throw new Error(`Lever board "${entry.board}" returned an unexpected response.`);
  }
  const items = data;
  return items
    .map((item) => normalizeLever(item, entry))
    .filter(
      (job) =>
        matchesKeywords(
          `${job.title} ${job.technologies.join(' ')}`,
          params.title,
          params.keywords
        ) && locationKeeps(params.country, params.location, params.remote, job.location || '', job.remoteType)
    );
}

export async function searchAtsBoards(
  params: JobSearchParams,
  boards: AtsBoard[] = []
): Promise<JobSourceSearchResult> {
  const country = normalizeCountryCode(params.country);
  const eligibleBoards = boards.filter((entry) =>
    sourceCoversCountry(
      { countries: entry.countries, regions: entry.regions, global: entry.global },
      country
    )
  );
  const settlements = await Promise.allSettled(
    eligibleBoards.map((entry) =>
      entry.provider === 'greenhouse'
        ? fetchGreenhouseBoard(entry, params)
        : entry.provider === 'ashby'
          ? fetchAshbyBoard(entry, params)
          : entry.provider === 'personio'
            ? fetchPersonioBoard(entry.board, entry.company, params)
            : fetchLeverBoard(entry, params)
    )
  );
  const jobs = settlements.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  const cap = Math.max((params.limit || 20) * 2, 20);
  return {
    jobs: jobs.slice(0, cap),
    totalDiscovered: jobs.length,
    source: 'ATS Boards (Free)',
    rawPayload: undefined,
  };
}
