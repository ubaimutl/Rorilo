import type { JobSearchParams, JobSourceSearchResult, NormalizedJobInput } from '../types';
import {
  detectRemoteType,
  extractTechnologies,
  sanitizeDescription,
} from '../../jobs/normalize';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Rorilo/1.0 (+local job search)';

/** Max detail pages fetched per search; bounds total time. */
const MAX_DETAILS = 12;
/** Parallel detail fetches; polite to the host. */
const CONCURRENCY = 3;

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function stepstoneSearchUrl(keywords: string, location: string): string {
  const kw = slugify(keywords) || 'jobs';
  const loc = slugify(location);
  return loc
    ? `https://www.stepstone.de/jobs/${kw}/in-${loc}/`
    : `https://www.stepstone.de/jobs/${kw}/`;
}

function stripTags(html: string): string {
  return sanitizeDescription(html);
}

export interface StepstoneListItem {
  title: string;
  detailUrl: string;
  company: string;
  location: string;
  timeago: string;
}

/** Split the result list into raw item blocks using the stable test id. */
export function splitListItems(html: string): string[] {
  const marker = 'data-testid="job-item"';
  const parts = html.split(marker);
  parts.shift();
  return parts.map((p) => marker + p.split('data-testid="job-item"')[0]);
}

function attrText(block: string, attr: string): string {
  // <... data-at="X" ...>inner</...> — capture inner HTML of the first match.
  const re = new RegExp(`data-at="${attr}"[^>]*>([\\s\\S]*?)(?:</(a|h\\d|div|span|p|li)>|$)`, 'i');
  const m = block.match(re);
  if (!m) return '';
  return stripTags(m[1]).replace(/\s+/g, ' ').trim();
}

function titleAndUrl(block: string): { title: string; href: string } {
  const re = /<a[^>]*data-testid="job-item-title"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
  const m = block.match(re) || block.match(/<a[^>]*href="([^"]+)"[^>]*data-testid="job-item-title"[^>]*>([\s\S]*?)<\/a>/i);
  if (!m) return { title: '', href: '' };
  return { title: stripTags(m[2]).replace(/\s+/g, ' ').trim(), href: m[1] };
}

export function parseListItem(block: string): StepstoneListItem | null {
  const { title, href } = titleAndUrl(block);
  if (!title || !href) return null;
  return {
    title,
    detailUrl: href.startsWith('http') ? href : `https://www.stepstone.de${href}`,
    company: attrText(block, 'job-item-company-name'),
    location: attrText(block, 'job-item-location'),
    timeago: attrText(block, 'job-item-timeago'),
  };
}

interface JobPostingJson {
  title?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string | string[];
  hiringOrganization?: { name?: string; sameAs?: string } | string;
  jobLocation?: unknown;
  url?: string;
}

export function extractJobPosting(html: string): JobPostingJson | null {
  const blocks = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const inner = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    let data: unknown;
    try {
      data = JSON.parse(inner);
    } catch {
      continue;
    }
    const list = Array.isArray(data) ? data : [data];
    for (const entry of list) {
      if (typeof entry !== 'object' || entry === null) continue;
      const graph = (entry as { '@graph'?: unknown })['@graph'];
      const candidates = Array.isArray(graph) ? (graph as unknown[]) : [entry];
      for (const c of candidates) {
        if (typeof c === 'object' && c !== null && (c as { '@type'?: string })['@type'] === 'JobPosting') {
          return c as JobPostingJson;
        }
      }
    }
  }
  return null;
}

function locationFromJobPosting(loc: unknown): string {
  if (!loc) return '';
  const first = Array.isArray(loc) ? loc[0] : loc;
  if (typeof first !== 'object' || first === null) return '';
  const addr = (first as { address?: unknown }).address;
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object' && addr !== null) {
    const a = addr as Record<string, unknown>;
    return [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(', ');
  }
  return '';
}

function employmentFrom(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const t = String(raw || '').toUpperCase();
  if (t.includes('FULL_TIME')) return 'full-time';
  if (t.includes('PART_TIME')) return 'part-time';
  if (t.includes('CONTRACTOR')) return 'contract';
  if (t.includes('INTERN')) return 'internship';
  return undefined;
}

export function normalizeStepstoneDetail(
  item: StepstoneListItem,
  posting: JobPostingJson | null
): NormalizedJobInput {
  const org = posting?.hiringOrganization;
  const company =
    (typeof org === 'object' && org !== null ? org.name : undefined) || item.company || 'Unknown Company';
  const description = posting?.description ? sanitizeDescription(posting.description) : '';
  const title = posting?.title || item.title;
  const location = locationFromJobPosting(posting?.jobLocation) || item.location;
  return {
    source: 'stepstone',
    sourceJobId: `stepstone:${item.detailUrl}`,
    title,
    company,
    location,
    countryCode: 'DE',
    remoteType: detectRemoteType(title, location, description),
    employmentType: employmentFrom(posting?.employmentType),
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: extractTechnologies(`${title}\n${description}`),
    languageRequirements: [],
    applicationUrl: item.detailUrl,
    originalUrl: item.detailUrl,
    datePosted: posting?.datePosted ? new Date(posting.datePosted) : undefined,
    rawData: { detailUrl: item.detailUrl, timeago: item.timeago },
  };
}

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`StepStone responded with status ${res.status}`);
    return await res.text();
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('StepStone took too long to respond (timeout). Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** List fetch with one retry — search pages are heavy and occasionally stall. */
async function fetchListHtml(url: string): Promise<string> {
  try {
    return await fetchText(url, 30000);
  } catch (err) {
    if ((err as Error).message.includes('too long')) {
      await new Promise((r) => setTimeout(r, 1500));
      return await fetchText(url, 30000);
    }
    throw err;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function searchStepstone(params: JobSearchParams): Promise<JobSourceSearchResult> {
  const keywords = [params.title, ...(params.keywords || [])].filter(Boolean).join(' ').trim();
  if (!keywords) throw new Error('StepStone needs a job title or keywords.');
  const location = (params.location || '').trim();
  const url = stepstoneSearchUrl(keywords, location);

  const html = await fetchListHtml(url);
  const items = splitListItems(html)
    .map(parseListItem)
    .filter((x): x is StepstoneListItem => x !== null)
    .slice(0, Math.max(1, Math.min(params.limit || 15, MAX_DETAILS)));

  if (items.length === 0) {
    return { jobs: [], totalDiscovered: 0, source: 'stepstone' };
  }

  const jobs = await mapLimit(items, CONCURRENCY, async (item) => {
    try {
      const detailHtml = await fetchText(item.detailUrl);
      return normalizeStepstoneDetail(item, extractJobPosting(detailHtml));
    } catch {
      return normalizeStepstoneDetail(item, null);
    }
  });

  return { jobs, totalDiscovered: jobs.length, source: 'stepstone' };
}
